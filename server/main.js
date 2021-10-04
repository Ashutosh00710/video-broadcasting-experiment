const { createServer } = require("http");
const { Server } = require("socket.io");

const httpServer = createServer();
const io = new Server(httpServer, {
  transports: ["websocket"],
});

const broadcaster = {};

io.on("connection", (client) => {
  client.on("broadcaster", (user) => {
    console.log(
      `register ${user.name} as ` + "broadcaster for room id:",
      user.room
    );
    broadcaster[user.room] = client.id;
    client.join(user.room);
  });

  client.on("viewer", (user) => {
    console.log(`register ${user.name} as ` + "viewer for room id:", user.room);
    client.join(user.room);
    user.id = client.id;
    client.to(broadcaster[user.room]).emit("viewer", user);
  });

  client.on("candidate", (id, event) => {
    client.to(id).emit("candidate", client.id, event);
  });

  client.on("offer", (id, event) => {
    event.broadcaster.id = client.id;
    client.to(id).emit("offer", event.broadcaster, event.sdp);
  });

  client.on("answer", (event) => {
    client.to(broadcaster[event.room]).emit("answer", client.id, event.sdp);
  });

  client.on("disconnect", (message) => {
    console.log("disconnected:", message);
  });
});

httpServer.listen(3000, () => {
  console.log("Server is running on port 3000");
});
