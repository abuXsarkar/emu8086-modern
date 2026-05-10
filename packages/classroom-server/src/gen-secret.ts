#!/usr/bin/env node
// Print a fresh 32-byte base64url secret for operators to paste into
// EMU8086_CLASSROOM_HMAC_SECRET. Single-purpose, no flags.
import { generateSecret } from "./host-token.js";

console.log(generateSecret());
