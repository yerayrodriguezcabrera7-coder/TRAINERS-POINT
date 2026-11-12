export function validProductImage(value: string) {
  if (!value || value.length > 750_000) return false;
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return false;
  const data = Buffer.from(match[2], "base64");
  if (data.toString("base64") !== match[2]) return false;
  return match[1] === "png" ? data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) :
    match[1] === "jpeg" ? data[0] === 255 && data[1] === 216 && data[2] === 255 :
    data.subarray(0,4).toString() === "RIFF" && data.subarray(8,12).toString() === "WEBP";
}
