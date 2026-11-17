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

/* ---------- Formato de los 8 bytes de datos (data[0..7]) de la trama del muñeco ----------
   Trama vieja:  [manos, prof L, prof H, frec L, frec H, FLAG RUN, -,      -       ]
   Trama nueva:  [manos, prof L, prof H, frec L, frec H, DESC L,   DESC H, FLAG RUN]
   Poner en true cuando el muñeco tenga el firmware nuevo (con descompresión). */
export const TRAMA_CON_DESCOMPRESION = false;

export const DATA_IDX = {
    MANOS:     0,
    PROF_LO:   1, PROF_HI: 2,
    FREC_LO:   3, FREC_HI: 4,
    DESC_LO:   5, DESC_HI: 6,                         /* sólo existen en la trama nueva */
    FLAG_RUN:  TRAMA_CON_DESCOMPRESION ? 7 : 5,
};

/* Posición de data[0] dentro de la trama completa de 18 bytes (ver frameParser.js) */
export const DATA_OFFSET = 9;
