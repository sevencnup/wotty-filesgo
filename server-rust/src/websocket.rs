use actix::prelude::*;
use actix_web_actors::ws::{self, WebsocketContext};
use crate::models::WSMessage;
use parking_lot::RwLock;
use std::collections::HashMap;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

pub struct Hub {
    clients: RwLock<HashMap<String, Addr<WsClientSession>>>,
}

impl Hub {
    pub fn new() -> Self {
        Self {
            clients: RwLock::new(HashMap::new()),
        }
    }

    pub fn register(&self, device_id: String, addr: Addr<WsClientSession>) {
        let mut clients = self.clients.write();
        if let Some(_old_addr) = clients.insert(device_id.clone(), addr) {
            log::info!("[WS] Replaced old connection for device: {}", device_id);
        }
        log::info!("[WS] Device connected: {}", device_id);
    }

    pub fn unregister(&self, device_id: &str) {
        let mut clients = self.clients.write();
        if clients.remove(device_id).is_some() {
            log::info!("[WS] Device disconnected: {}", device_id);
        }
    }

    pub fn send_to_device(&self, device_id: &str, message: &WSMessage) -> bool {
        let clients = self.clients.read();
        if let Some(addr) = clients.get(device_id) {
            if let Ok(json) = serde_json::to_string(message) {
                addr.do_send(WsSend(json));
                return true;
            }
        }
        false
    }

    pub fn broadcast(&self, message: &WSMessage) {
        if let Ok(json) = serde_json::to_string(message) {
            let clients = self.clients.read();
            for addr in clients.values() {
                addr.do_send(WsSend(json.clone()));
            }
        }
    }

    pub fn is_online(&self, device_id: &str) -> bool {
        self.clients.read().contains_key(device_id)
    }

    pub fn broadcast_device_status(&self, device_id: &str, _device_name: &str, status: &str) {
        let msg = WSMessage {
            msg_type: "device_status".to_string(),
            from_device: Some(device_id.to_string()),
            to_device: None,
            content: Some(status.to_string()),
            message_id: None,
            message_type: None,
            status: None,
            timestamp: Some(SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() as i64),
            file_name: None,
            file_size: None,
            file_code: None,
        };
        self.broadcast(&msg);
    }
}

impl Default for Hub {
    fn default() -> Self {
        Self::new()
    }
}

pub struct WsClientSession {
    pub device_id: String,
    pub device_name: String,
    pub hub: actix::Addr<HubActor>,
}

impl Actor for WsClientSession {
    type Context = WebsocketContext<Self>;

    fn started(&mut self, ctx: &mut Self::Context) {
        self.hub.do_send(RegisterClient {
            device_id: self.device_id.clone(),
        });
        
        ctx.run_interval(Duration::from_secs(30), |act, ctx| {
            act.hub.do_send(PingClient {
                device_id: act.device_id.clone(),
            });
        });
    }

    fn stopped(&mut self, _ctx: &mut Self::Context) {
        self.hub.do_send(UnregisterClient {
            device_id: self.device_id.clone(),
        });
    }
}

impl StreamHandler<Result<ws::Message, ws::ProtocolError>> for WsClientSession {
    fn handle(&mut self, msg: Result<ws::Message, ws::ProtocolError>, ctx: &mut Self::Context) {
        match msg {
            Ok(ws::Message::Ping(msg)) => ctx.pong(&msg),
            Ok(ws::Message::Pong(_)) => (),
            Ok(ws::Message::Text(text)) => {
                log::debug!("[WS] Received text from {}: {}", self.device_id, text);
            }
            Ok(ws::Message::Binary(bin)) => ctx.binary(bin),
            Ok(ws::Message::Close(reason)) => {
                ctx.close(reason);
                ctx.stop();
            }
            _ => (),
        }
    }
}

#[derive(Message)]
#[rtype(result = "()")]
pub struct WsSend(pub String);

impl Handler<WsSend> for WsClientSession {
    type Result = ();

    fn handle(&mut self, msg: WsSend, ctx: &mut Self::Context) {
        ctx.text(msg.0);
    }
}

pub struct HubActor {
    hub: Hub,
}

impl HubActor {
    pub fn new() -> Self {
        Self { hub: Hub::new() }
    }

    pub fn hub(&self) -> &Hub {
        &self.hub
    }
}

impl Default for HubActor {
    fn default() -> Self {
        Self::new()
    }
}

impl Actor for HubActor {
    type Context = Context<Self>;
}

#[derive(Message)]
#[rtype(result = "()")]
pub struct RegisterClient {
    pub device_id: String,
}

#[derive(Message)]
#[rtype(result = "()")]
pub struct UnregisterClient {
    pub device_id: String,
}

#[derive(Message)]
#[rtype(result = "()")]
pub struct PingClient {
    pub device_id: String,
}

#[derive(Message)]
#[rtype(result = "()")]
pub struct SendToDevice {
    pub device_id: String,
    pub message: WSMessage,
}

#[derive(Message)]
#[rtype(result = "()")]
pub struct BroadcastMessage {
    pub message: WSMessage,
}

#[derive(Message)]
#[rtype(result = "Vec<String>")]
pub struct GetOnlineDevices;

impl Handler<RegisterClient> for HubActor {
    type Result = ();

    fn handle(&mut self, msg: RegisterClient, _ctx: &mut Self::Context) {
        log::info!("[WS] Register client: {}", msg.device_id);
    }
}

impl Handler<UnregisterClient> for HubActor {
    type Result = ();

    fn handle(&mut self, msg: UnregisterClient, _ctx: &mut Self::Context) {
        self.hub.unregister(&msg.device_id);
    }
}

impl Handler<PingClient> for HubActor {
    type Result = ();

    fn handle(&mut self, msg: PingClient, _ctx: &mut Self::Context) {
        let ping_msg = WSMessage {
            msg_type: "ping".to_string(),
            from_device: None,
            to_device: None,
            content: None,
            message_id: None,
            message_type: None,
            status: None,
            timestamp: Some(SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() as i64),
            file_name: None,
            file_size: None,
            file_code: None,
        };
        self.hub.send_to_device(&msg.device_id, &ping_msg);
    }
}

impl Handler<SendToDevice> for HubActor {
    type Result = ();

    fn handle(&mut self, msg: SendToDevice, _ctx: &mut Self::Context) {
        self.hub.send_to_device(&msg.device_id, &msg.message);
    }
}

impl Handler<BroadcastMessage> for HubActor {
    type Result = ();

    fn handle(&mut self, msg: BroadcastMessage, _ctx: &mut Self::Context) {
        self.hub.broadcast(&msg.message);
    }
}

impl Handler<GetOnlineDevices> for HubActor {
    type Result = Vec<String>;

    fn handle(&mut self, _msg: GetOnlineDevices, _ctx: &mut Self::Context) -> Self::Result {
        self.hub.clients.read().keys().cloned().collect()
    }
}
