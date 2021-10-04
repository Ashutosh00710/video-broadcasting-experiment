const selectRoom = document.getElementById("room");
const consultingRoom = document.getElementById("consulting-room");
const inputName = document.getElementById("name");
const inputRoomName = document.getElementById("room-name");
const btnJoinAsBroadcaster = document.getElementById("join-as-broadcaster");
const btnJoinAsViewer = document.getElementById("join-as-viewer");
const videoElement = document.getElementById("player");
const broadcasterName = document.getElementById("broadcaster-name");
const viewers = document.getElementById("viewers");

const CONSTANTS = {
  // to get the public IP
  // reason: NAT
  ICE_SERVERS: {
    iceServers: [
      {
        urls: "stun:stun.l.google.com:19302",
      },
      {
        urls: "stun:stun.services.mozilla.com",
      },
    ],
  },
  // constrains for media access (through getUserMedia)
  STREAM_CONSTRAINS: {
    audio: { echoCancellation: true, noiseSuppression: true },
    video: true,
  },
};

// user can be a viewer or a broadcaster
let user;

// hash map for all PeerConnections
const rtcPeerConnections = {};

// socket instance
const socket = io("ws://localhost:3000", {
  transports: ["websocket"],
});

btnJoinAsBroadcaster.onclick = function () {
  // check for input values
  if (inputRoomName.value == "" || inputName == "") {
    alert("Please enter room name and name");
    return;
  } else {
    // create user object
    user = {
      name: inputName.value,
      room: inputRoomName.value,
    };

    // hide input fields
    selectRoom.style.display = "none";
    // show consulting room
    consultingRoom.style.display = "block";
    broadcasterName.innerText = user.name + " is broadcasting...";

    // access user media
    navigator.mediaDevices
      .getUserMedia(CONSTANTS.STREAM_CONSTRAINS)
      .then((stream) => {
        videoElement.srcObject = stream;
        socket.emit("broadcaster", user);
      })
      .catch((err) => {
        console.log("An error occured when accessing media devices", err);
      });

    // mute audio for the broadcaster
    videoElement.muted = true;
  }
};

btnJoinAsViewer.onclick = function () {
  // check for input values
  if (inputRoomName.value == "" || inputName == "") {
    alert("Please enter room name and name");
    return;
  } else {
    // create user object
    user = {
      name: inputName.value,
      room: inputRoomName.value,
    };

    // hide input fields
    selectRoom.style.display = "none";
    // show consulting room
    consultingRoom.style.display = "block";
    // join the room
    socket.emit("viewer", user);
  }
};

// message handlers
socket.on("viewer", function (viewer) {
  rtcPeerConnections[viewer.id] = new RTCPeerConnection(CONSTANTS.ICE_SERVERS);

  const stream = videoElement.srcObject;
  stream
    .getTracks()
    .forEach((track) => rtcPeerConnections[viewer.id].addTrack(track, stream));

  rtcPeerConnections[viewer.id].onicecandidate = (event) => {
    if (event.candidate) {
      console.log("sending ice candidate");
      socket.emit("candidate", viewer.id, {
        type: "candidate",
        label: event.candidate.sdpMLineIndex,
        id: event.candidate.sdpMid,
        candidate: event.candidate.candidate,
      });
    }
  };

  rtcPeerConnections[viewer.id]
    .createOffer()
    .then((sessionDescription) => {
      rtcPeerConnections[viewer.id].setLocalDescription(sessionDescription);
      socket.emit("offer", viewer.id, {
        type: "offer",
        sdp: sessionDescription,
        broadcaster: user,
      });
    })
    .catch((error) => {
      console.log(error);
    });

  let li = document.createElement("li");
  li.innerText = viewer.name + " has joined";
  viewers.appendChild(li);
});

socket.on("candidate", function (id, event) {
  const candidate = new RTCIceCandidate({
    sdpMLineIndex: event.label,
    candidate: event.candidate,
  });
  rtcPeerConnections[id].addIceCandidate(candidate);
});

socket.on("offer", function (broadcaster, sdp) {
  broadcasterName.innerText = broadcaster.name + " is broadcasting...";
  // create a new PeerConnection
  rtcPeerConnections[broadcaster.id] = new RTCPeerConnection(
    CONSTANTS.ICE_SERVERS
  );

  // set the remote description
  rtcPeerConnections[broadcaster.id].setRemoteDescription(sdp);

  // create an answer to an offer
  rtcPeerConnections[broadcaster.id]
    .createAnswer()
    .then(function (sessionDescription) {
      rtcPeerConnections[broadcaster.id].setLocalDescription(
        sessionDescription
      );
      // send the answer to the broadcaster
      socket.emit("answer", {
        type: "answer",
        sdp: sessionDescription,
        room: user.room,
      });
    });

  // add the remote stream to the video element
  rtcPeerConnections[broadcaster.id].ontrack = function (event) {
    videoElement.srcObject = event.streams[0];
  };

  // add the ICE candidate to the PeerConnection
  rtcPeerConnections[broadcaster.id].onicecandidate = function (event) {
    if (event.candidate) {
      // send the ICE candidate to the broadcaster
      socket.emit("candidate", {
        type: "candidate",
        label: event.candidate.sdpMLineIndex,
        id: event.candidate.sdpMid,
        candidate: event.candidate.candidate,
      });
    }
  };
});

socket.on("answer", function (id, event) {
  rtcPeerConnections[id].setRemoteDescription(new RTCSessionDescription(event));
});

socket.on("disconnect", function (id) {
  rtcPeerConnections[id].close();
  delete rtcPeerConnections[id];
});
