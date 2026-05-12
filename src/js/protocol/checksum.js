/* Checksum de complemento a uno sobre el array de bytes recibido */
export function calculateChecksum(arr) {
    let sum = 0;
    for (const b of arr) sum += b;
    while (sum > 0xFF) sum = (sum & 0xFF) + (sum >> 8);
    return ~sum & 0xFF;
}
