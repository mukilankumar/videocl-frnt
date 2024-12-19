// src/VideoChat.js
import React, { useEffect, useRef, useState } from "react";
import io from "socket.io-client";

const VideoChat = () => {
  const [myID, setMyID] = useState(""); // My user ID
  const [connected, setConnected] = useState(false); // Call status
  const [callAccepted, setCallAccepted] = useState(false); // Call accepted status
  const [remoteStream, setRemoteStream] = useState(null); // Remote stream
  const [userList, setUserList] = useState([]); // List of connected users
  const [incomingCall, setIncomingCall] = useState(false); // For incoming calls

  const [videoMuted, setVideoMuted] = useState(false); // Video muted state
  const [audioMuted, setAudioMuted] = useState(false); // Audio muted state

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  const socket = useRef();
  const peerConnection = useRef(null);

  // ICE server configuration
  const configuration = {
    iceServers: [
      {
        urls: "stun:stun.l.google.com:19302",
      },
    ],
  };

  useEffect(() => {
    // Prompt for User ID at the start
    const userID = prompt("Enter your user ID:");
    if (userID) {
      setMyID(userID);
    } else {
      alert("User ID is required to proceed.");
    }

    socket.current = io("https://videocl-bck.onrender.com"); // Backend signaling server URL

    socket.current.on("connect", () => {
      console.log("Connected to signaling server");
    });

    // Listen for the user list update
    socket.current.on("user-list", (users) => {
      setUserList(users); // Update the list of available users
    });

    // Handle incoming calls
    socket.current.on("incoming-call", (callerID) => {
      console.log(`Incoming call from ${callerID}`);
      if (window.confirm(`Incoming call from ${callerID}. Do you want to answer?`)) {
        setIncomingCall(true);
        handleAnswerCall(callerID);
      }
    });

    // Get local media stream and create peer connection
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        localVideoRef.current.srcObject = stream;
        peerConnection.current = new RTCPeerConnection(configuration);

        stream.getTracks().forEach((track) => {
          peerConnection.current.addTrack(track, stream);
        });

        peerConnection.current.onicecandidate = (event) => {
          if (event.candidate) {
            socket.current.emit("ice-candidate", event.candidate);
          }
        };

        peerConnection.current.ontrack = (event) => {
          remoteVideoRef.current.srcObject = event.streams[0];
          setRemoteStream(event.streams[0]);
        };

        socket.current.emit("join-room", myID);
      })
      .catch((err) => {
        console.error("Failed to get local stream", err);
      });

    return () => {
      if (peerConnection.current) {
        peerConnection.current.close();
      }
      socket.current.disconnect();
    };
  }, [myID]);

  // Handle call initiation
  const handleCall = (toUserID) => {
    socket.current.emit("call", toUserID); // Emit the call event to the backend

    peerConnection.current.createOffer()
      .then((offer) => {
        return peerConnection.current.setLocalDescription(offer);
      })
      .then(() => {
        socket.current.emit("offer", {
          offer: peerConnection.current.localDescription,
          to: toUserID,
        });
      })
      .catch((err) => {
        console.error("Error creating offer", err);
      });

    setConnected(true);
  };

  // Handle answering a call
  const handleAnswerCall = (callerID) => {
    setConnected(true);
    setIncomingCall(false);

    peerConnection.current.createAnswer()
      .then((answer) => {
        return peerConnection.current.setLocalDescription(answer);
      })
      .then(() => {
        socket.current.emit("answer", peerConnection.current.localDescription);
        setCallAccepted(true);
      })
      .catch((err) => {
        console.error("Error answering call", err);
      });
  };

  // Handle ending the call
  const handleEndCall = () => {
    setConnected(false);
    setCallAccepted(false);
    setIncomingCall(false);
    peerConnection.current.close();
  };

  // Mute/Unmute Video
  const toggleVideoMute = () => {
    const stream = localVideoRef.current.srcObject;
    if (stream) {
      stream.getVideoTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setVideoMuted(!videoMuted);
    }
  };

  // Mute/Unmute Audio
  const toggleAudioMute = () => {
    const stream = localVideoRef.current.srcObject;
    if (stream) {
      stream.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setAudioMuted(!audioMuted);
    }
  };

  return (
    <div>
      <h1>Video Chat</h1>
      <div>
        <h2>Your ID: {myID}</h2>
        <video ref={localVideoRef} autoPlay muted></video>
        <video ref={remoteVideoRef} autoPlay></video>

        <div>
          <h3>Available Users:</h3>
          <ul>
            {userList.map((userID) => (
              <li key={userID}>
                <button onClick={() => handleCall(userID)}>{userID}</button>
              </li>
            ))}
          </ul>
        </div>

        {connected && !callAccepted && !incomingCall && (
          <p>Waiting for the other user to accept...</p>
        )}

        {incomingCall && !callAccepted && (
          <div>
            <p>Incoming call...</p>
            <button onClick={() => handleAnswerCall("caller")}>Answer</button>
          </div>
        )}

        {callAccepted && (
          <div>
            <button onClick={handleEndCall}>End Call</button>
            <button onClick={toggleAudioMute}>
              {audioMuted ? "Unmute Audio" : "Mute Audio"}
            </button>
            <button onClick={toggleVideoMute}>
              {videoMuted ? "Unmute Video" : "Mute Video"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default VideoChat;
