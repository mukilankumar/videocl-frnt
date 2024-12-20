// VideoChat.js
import React, { useEffect, useRef, useState } from "react";
import io from "socket.io-client";

const VideoChat = () => {
  const [myID, setMyID] = useState("");
  const [connected, setConnected] = useState(false);
  const [callAccepted, setCallAccepted] = useState(false);
  const [userList, setUserList] = useState([]);
  const [incomingCall, setIncomingCall] = useState(null);
  const [videoMuted, setVideoMuted] = useState(false);
  const [audioMuted, setAudioMuted] = useState(false);
  const [currentCall, setCurrentCall] = useState(null);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const socket = useRef(null);
  const peerConnection = useRef(null);

  const configuration = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" }
    ]
  };

  useEffect(() => {
    init();
    return () => cleanup();
  }, []);

  const init = async () => {
    const userID = prompt("Enter your user ID:");
    if (!userID) {
      alert("User ID is required!");
      return;
    }
    setMyID(userID);

    // Initialize socket connection
    socket.current = io("https://videocl-bck.onrender.com");
    setupSocketListeners();

    // Initialize media devices
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Error accessing media devices:", err);
      alert("Cannot access camera or microphone!");
    }
  };

  const setupSocketListeners = () => {
    socket.current.on("connect", () => {
      console.log("Connected to server");
      socket.current.emit("join-room", myID);
    });

    socket.current.on("user-list", (users) => {
      setUserList(users.filter(id => id !== myID));
    });

    socket.current.on("offer", async ({ offer, from }) => {
      console.log("Received offer from:", from);
      if (!peerConnection.current) {
        createPeerConnection();
      }
      
      try {
        await peerConnection.current.setRemoteDescription(new RTCSessionDescription(offer));
        setIncomingCall({ from });
      } catch (err) {
        console.error("Error setting remote description:", err);
      }
    });

    socket.current.on("answer", async ({ answer, from }) => {
      console.log("Received answer from:", from);
      try {
        const answerDesc = new RTCSessionDescription(answer);
        await peerConnection.current.setRemoteDescription(answerDesc);
      } catch (err) {
        console.error("Error setting remote description:", err);
      }
    });

    socket.current.on("ice-candidate", async ({ candidate, from }) => {
      try {
        if (peerConnection.current) {
          await peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
        }
      } catch (err) {
        console.error("Error adding ICE candidate:", err);
      }
    });
  };

  const createPeerConnection = () => {
    try {
      peerConnection.current = new RTCPeerConnection(configuration);

      // Add local tracks
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => {
          peerConnection.current.addTrack(track, localStreamRef.current);
        });
      }

      // Handle incoming tracks
      peerConnection.current.ontrack = ({ streams: [stream] }) => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = stream;
        }
      };

      // Handle ICE candidates
      peerConnection.current.onicecandidate = (event) => {
        if (event.candidate) {
          const to = currentCall?.to || incomingCall?.from;
          if (to) {
            socket.current.emit("ice-candidate", {
              candidate: event.candidate,
              to
            });
          }
        }
      };

      peerConnection.current.oniceconnectionstatechange = () => {
        if (peerConnection.current?.iceConnectionState === 'disconnected') {
          handleCallEnd();
        }
      };

    } catch (err) {
      console.error("Error creating peer connection:", err);
    }
  };

  const handleCall = async (toUserID) => {
    try {
      createPeerConnection();
      setCurrentCall({ to: toUserID });

      const offer = await peerConnection.current.createOffer();
      await peerConnection.current.setLocalDescription(offer);

      socket.current.emit("offer", {
        offer,
        to: toUserID,
        from: myID
      });

      setConnected(true);
    } catch (err) {
      console.error("Error making call:", err);
      handleCallEnd();
    }
  };

  const handleAnswerCall = async () => {
    if (!incomingCall) return;

    try {
      createPeerConnection();
      setCurrentCall({ to: incomingCall.from });

      const answer = await peerConnection.current.createAnswer();
      await peerConnection.current.setLocalDescription(answer);

      socket.current.emit("answer", {
        answer,
        to: incomingCall.from,
        from: myID
      });

      setCallAccepted(true);
      setConnected(true);
      setIncomingCall(null);
    } catch (err) {
      console.error("Error answering call:", err);
      handleCallEnd();
    }
  };

  const handleCallEnd = () => {
    if (peerConnection.current) {
      peerConnection.current.close();
      peerConnection.current = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    setConnected(false);
    setCallAccepted(false);
    setIncomingCall(null);
    setCurrentCall(null);
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setVideoMuted(!videoMuted);
    }
  };

  const toggleAudio = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setAudioMuted(!audioMuted);
    }
  };

  const cleanup = () => {
    handleCallEnd();
    if (socket.current) {
      socket.current.disconnect();
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
    }
  };

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Video Chat</h1>
      <div className="mb-4">Your ID: {myID}</div>
      
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <h2 className="text-lg mb-2">Local Video</h2>
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full bg-black rounded"
          />
        </div>
        <div>
          <h2 className="text-lg mb-2">Remote Video</h2>
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="w-full bg-black rounded"
          />
        </div>
      </div>

      {!connected && !incomingCall && (
        <div className="mb-4">
          <h2 className="text-lg mb-2">Available Users</h2>
          <div className="flex flex-wrap gap-2">
            {userList.map((userID) => (
              <button
                key={userID}
                onClick={() => handleCall(userID)}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Call {userID}
              </button>
            ))}
          </div>
        </div>
      )}

      {incomingCall && (
        <div className="mb-4 p-4 bg-yellow-100 rounded">
          <p className="mb-2">Incoming call from {incomingCall.from}</p>
          <div className="flex gap-2">
            <button
              onClick={handleAnswerCall}
              className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
            >
              Answer
            </button>
            <button
              onClick={() => setIncomingCall(null)}
              className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
            >
              Decline
            </button>
          </div>
        </div>
      )}

      {connected && (
        <div className="flex gap-2">
          <button
            onClick={handleCallEnd}
            className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
          >
            End Call
          </button>
          <button
            onClick={toggleAudio}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            {audioMuted ? 'Unmute Audio' : 'Mute Audio'}
          </button>
          <button
            onClick={toggleVideo}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            {videoMuted ? 'Unmute Video' : 'Mute Video'}
          </button>
        </div>
      )}
    </div>
  );
};

export default VideoChat;
