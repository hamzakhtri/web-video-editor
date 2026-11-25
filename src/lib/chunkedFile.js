// Chrome refuses a Blob built from one buffer bigger than 2GB, even after the
// file has already been encoded. Keep the MP4 in separate pieces instead.
const DEFAULT_CHUNK = 32 * 1024 * 1024;

export function createChunkedBytes(chunkBytes = DEFAULT_CHUNK) {
  const parts = [];
  let size = 0;

  const write = (data, position) => {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    if (!bytes.byteLength) return;
    const start = position;
    const end = start + bytes.byteLength;
    while (parts.length * chunkBytes < end) parts.push(new Uint8Array(chunkBytes));
    let offset = 0;
    while (offset < bytes.byteLength) {
      const at = start + offset;
      const index = Math.floor(at / chunkBytes);
      const into = at - index * chunkBytes;
      const take = Math.min(chunkBytes - into, bytes.byteLength - offset);
      parts[index].set(bytes.subarray(offset, offset + take), into);
      offset += take;
    }
    if (end > size) size = end;
  };

  const toBlob = (type) => {
    if (!size) return new Blob([], { type });
    const slices = [];
    const full = Math.floor(size / chunkBytes);
    for (let index = 0; index < full; index += 1) slices.push(parts[index]);
    const tail = size % chunkBytes;
    if (tail) slices.push(parts[full].subarray(0, tail));
    return new Blob(slices, { type });
  };

  return {
    write,
    toBlob,
    get size() { return size; },
  };
}
