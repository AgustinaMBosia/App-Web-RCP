/* Comandos del protocolo Buddy */
export const CMD = {
    PING:           0x01,
    CONFIRM:        0x02,
    ACK_HANDS:      0x03,
    ACK_DATA:       0x04,
    FINISH:         0x05,
    LOW_BATTERY:    0x09,
    SENSOR_FAIL_A:  0x0A,
    SENSOR_FAIL_B:  0x0B,
    FRAME_END:      0x0D,
    CONFIRM_REQ:    0x65,
    HANDS_STATUS:   0x66,
    SENSOR_DATA:    0x68,
    HANDS_OK_VAL:   0x71,
    BUDDY_RESET:    0xFF,
};

export const BUDDY_ID          = 0x64;
export const PROGRESS_DURATION = 60; // segundos
