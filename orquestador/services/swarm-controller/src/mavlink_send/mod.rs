//! Envío de comandos MAVLink2 a interceptores (UDP). PoC: enviamos un mensaje
//! `COMMAND_INT` con waypoint LATLONALT y un `MISSION_ITEM_INT`.
//!
//! En producción: link cifrado por encima (MACsec/IPSec o radio FH-LPI/LPD).

use mavlink::common::*;
use mavlink::{MavConnection, MavlinkVersion};
use tracing::{error, info, warn};

pub struct MavlinkClient {
    conn: Option<Box<dyn MavConnection<MavMessage> + Sync + Send>>,
    target_string: String,
}

impl MavlinkClient {
    pub fn new(target: &str) -> Self {
        let url = format!("udpout:{}", target);
        let conn = match mavlink::connect::<MavMessage>(&url) {
            Ok(mut c) => {
                c.set_protocol_version(MavlinkVersion::V2);
                Some(c)
            }
            Err(e) => {
                warn!(error = %e, target = %target, "mavlink connect failed; modo stub");
                None
            }
        };
        Self {
            conn,
            target_string: target.to_string(),
        }
    }

    pub fn send_engage_waypoint(
        &self,
        sys_id: u8,
        component_id: u8,
        lat_deg: f64,
        lon_deg: f64,
        alt_m: f32,
    ) -> Result<(), String> {
        let header = mavlink::MavHeader {
            system_id: 255,
            component_id: 190,
            sequence: 0,
        };
        let msg = MavMessage::MISSION_ITEM_INT(MISSION_ITEM_INT_DATA {
            param1: 0.0,
            param2: 0.0,
            param3: 0.0,
            param4: 0.0,
            x: (lat_deg * 1e7) as i32,
            y: (lon_deg * 1e7) as i32,
            z: alt_m,
            seq: 0,
            command: MavCmd::MAV_CMD_NAV_WAYPOINT,
            target_system: sys_id,
            target_component: component_id,
            frame: MavFrame::MAV_FRAME_GLOBAL_RELATIVE_ALT_INT,
            current: 1,
            autocontinue: 1,
            mission_type: MavMissionType::MAV_MISSION_TYPE_MISSION,
        });
        match &self.conn {
            Some(c) => {
                c.send(&header, &msg).map_err(|e| {
                    error!(error = %e, "mavlink send falló");
                    e.to_string()
                })?;
                info!(sys_id, lat_deg, lon_deg, alt_m, target = %self.target_string, "waypoint MAVLink enviado");
                Ok(())
            }
            None => {
                warn!(sys_id, lat_deg, lon_deg, "stub MAVLink: comando registrado pero no enviado");
                Ok(())
            }
        }
    }

    pub fn send_abort(&self, sys_id: u8) -> Result<(), String> {
        let header = mavlink::MavHeader {
            system_id: 255,
            component_id: 190,
            sequence: 0,
        };
        let msg = MavMessage::COMMAND_LONG(COMMAND_LONG_DATA {
            param1: 1.0,
            param2: 0.0,
            param3: 0.0,
            param4: 0.0,
            param5: 0.0,
            param6: 0.0,
            param7: 0.0,
            command: MavCmd::MAV_CMD_DO_FLIGHTTERMINATION,
            target_system: sys_id,
            target_component: 1,
            confirmation: 0,
        });
        match &self.conn {
            Some(c) => {
                c.send(&header, &msg).map_err(|e| e.to_string())?;
                info!(sys_id, "ABORT enviado por MAVLink");
                Ok(())
            }
            None => {
                warn!(sys_id, "stub MAVLink: ABORT registrado");
                Ok(())
            }
        }
    }
}

