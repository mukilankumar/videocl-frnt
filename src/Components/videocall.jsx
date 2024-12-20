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

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const socket = useRef(null);
  const peerConnection = useRef(null);

  const configuration = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ],
  };

  // Initialize WebSocket and local media
  useEffect(() => {
    const userID = prompt("Enter your user ID:");
    if (!userID) {
      alert("User ID is required to proceed.");
      return;
    }
    setMyID(userID);

    // Connect to signaling server
    socket.current = io("https://videocl-bck.onrender.com");

    // Initialize media and WebRTC
    initializeMediaDevices();

    // Socket event handlers
    socket.current.on("connect", () => {
      console.log("Connected to signaling server");
      socket.current.emit("join-room", userID);
    });

    socket.current.on("user-list", (users) => {
      setUserList(users.filter(id => id !== userID));
    });

    socket.current.on("offer", handleIncomingOffer);
    socket.current.on("answer", handleAnswer);
    socket.current.on("ice-candidate", handleNewICECandidate);

    return () => {
      cleanupConnection();
    };
  }, []);

  const initializeMediaDevices = async () => {
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
    }
  };

  const createPeerConnection = () => {
    peerConnection.current = new RTCPeerConnection(configuration);

    // Add local stream tracks to peer connection
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
        socket.current.emit("ice-candidate", {
          candidate: event.candidate,
          to: incomingCall ? incomingCall.from : callAccepted
        });
      }
    };

    peerConnection.current.oniceconnectionstatechange = () => {
      console.log("ICE Connection State:", peerConnection.current.iceConnectionState);
    };
  };

  const handleCall = async (toUserID) => {
    setCallAccepted(toUserID);
    createPeerConnection();

    try {
      const offer = await peerConnection.current.createOffer();
      await peerConnection.current.setLocalDescription(offer);

      socket.current.emit("offer", {
        offer,
        to: toUserID,
        from: myID
      });
      
      setConnected(true);
    } catch (err) {
      console.error("Error creating offer:", err);
      cleanupConnection();
    }
  };

  const handleIncomingOffer = async ({ offer, from }) => {
    setIncomingCall({ from, offer });
  };

  const handleAnswerCall = async () => {
    if (!incomingCall) return;

    createPeerConnection();
    try {
      await peerConnection.current.setRemoteDescription(new RTCSessionDescription(incomingCall.offer));
      
      const answer = await peerConnection.current.createAnswer();
      await peerConnection.current.setLocalDescription(answer);

      socket.current.emit("answer", {
        answer,
        to: incomingCall.from,
        from: myID
      });

      setCallAccepted(incomingCall.from);
      setConnected(true);
      setIncomingCall(null);
    } catch (err) {
      console.error("Error answering call:", err);
      cleanupConnection();
    }
  };

  const handleAnswer = async ({ answer }) => {
    try {
      await peerConnection.current.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (err) {
      console.error("Error setting remote description:", err);
    }
  };

  const handleNewICECandidate = async ({ candidate }) => {
    try {
      if (peerConnection.current && candidate) {
        await peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
      }
    } catch (err) {
      console.error("Error adding ICE candidate:", err);
    }
  };

  const cleanupConnection = () => {
    if (peerConnection.current) {
      peerConnection.current.close();
      peerConnection.current = null;
    }
    if (socket.current) {
      socket.current.disconnect();
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
    }
    setConnected(false);
    setCallAccepted(false);
    setIncomingCall(null);
  };

  const handleEndCall = () => {
    cleanupConnection();
  };

  const toggleVideoMute = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setVideoMuted(!videoMuted);
    }
  };

  const toggleAudioMute = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setAudioMuted(!audioMuted);
    }
  };

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Video Chat</h1>
      <div className="space-y-4">
        <h2 className="text-xl">Your ID: {myID}</h2>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <h3 className="text-lg mb-2">Local Video</h3>
            <video 
              ref={localVideoRef}
              autoPlay 
              muted 
              playsInline
              className="w-full bg-gray-200 rounded"
            />
          </div>
          <div>
            <h3 className="text-lg mb-2">Remote Video</h3>
            <video 
              ref={remoteVideoRef}
              autoPlay 
              playsInline
              className="w-full bg-gray-200 rounded"
            />
          </div>
        </div>

        <div className="border p-4 rounded">
          <h3 className="text-lg mb-2">Available Users:</h3>
          <ul className="space-y-2">
            {userList.map((userID) => (
              <li key={userID}>
                <button
                  onClick={() => handleCall(userID)}
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                  disabled={connected}
                >
                  Call {userID}
                </button>
              </li>
            ))}
          </ul>
        </div>

        {connected && !callAccepted && !incomingCall && (
          <p className="text-yellow-600">Waiting for the other user to accept...</p>
        )}

        {incomingCall && (
          <div className="border p-4 rounded bg-yellow-50">
            <p>Incoming call from {incomingCall.from}...</p>
            <button
              onClick={handleAnswerCall}
              className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
            >
              Answer
            </button>
          </div>
        )}

        {callAccepted && (
          <div className="flex space-x-4">
            <button
              onClick={handleEndCall}
              className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
            >
              End Call
            </button>
            <button
              onClick={toggleAudioMute}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              {audioMuted ? "Unmute Audio" : "Mute Audio"}
            </button>
            <button
              onClick={toggleVideoMute}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              {videoMuted ? "Unmute Video" : "Mute Video"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default VideoChat;
