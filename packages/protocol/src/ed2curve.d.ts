declare module 'ed2curve' {
  const ed2curve: {
    convertPublicKey(pk: Uint8Array): Uint8Array | null;
    convertSecretKey(sk: Uint8Array): Uint8Array;
    convertKeyPair(kp: { publicKey: Uint8Array; secretKey: Uint8Array }): {
      publicKey: Uint8Array;
      secretKey: Uint8Array;
    } | null;
  };
  export default ed2curve;
}
