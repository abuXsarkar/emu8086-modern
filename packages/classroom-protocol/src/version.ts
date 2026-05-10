// Bump this every time ClientMsg or ServerMsg changes shape in a way
// that an old client wouldn't understand or an old server wouldn't
// accept. The server compares the client's reported version on join
// and refuses with a clear error if there's a mismatch — better a
// loud "please refresh" than a confusing silent drop later.
//
// Compatibility rule: any change that adds a new optional field is a
// non-breaking patch (no bump). Any change that adds a new message
// type, removes a field, renames a field, or tightens a constraint is
// breaking (bump). Old clients connecting after a bump will see a
// `protocol_mismatch` error and are expected to refresh.
export const PROTOCOL_VERSION = 2;
