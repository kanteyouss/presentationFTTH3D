import { NetworkModel } from './src/NetworkModel.js';
// We just want to emulate or check main.js but we can't easily without babylon.
// Let's just find a point in SRO-A (x:-10, z:-10) but > 20m from PBOs:
// SRO is at -10,-10
// PBO1: -25, -15  (dist to SRO = 15)
// PBO2: -5, -25   (dist to SRO = 15)
// PBO3: 5, -8     (dist to SRO = 15)
console.log("Checking distance from a building at (-10, 20)");
const dx = -10 - 5; const dz = 20 - (-8); console.log(Math.sqrt((dx*dx) + (dz*dz)));
