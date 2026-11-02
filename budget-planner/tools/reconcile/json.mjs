// Preserve monetary number lexemes before binary JSON parsing can round them.
// Other numeric fields (versions, settings) retain their original JSON types.
const moneyKeys = new Set(['amount','actualAmount','plannedAmount','startingAmount','startingBalance','targetAmount','balance']);
export function decodeBackup(text) {
  JSON.parse(text); // Validate the complete grammar before token-level preservation.
  let key = null;
  const objects = [];
  const preserved = text.replace(/"(?:\\.|[^"\\])*"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|\{|\}|\[|\]/g, (token, offset) => {
    if (token === '{' || token === '[') { objects.push(token === '{' ? new Set() : null); key = null; return token; }
    if (token === '}' || token === ']') { objects.pop(); key = null; return token; }
    if (token.startsWith('"')) {
      if (/^\s*:/.test(text.slice(offset + token.length))) {
        key = JSON.parse(token);
        const keys = objects.at(-1);
        if (keys.has(key)) throw new Error();
        keys.add(key);
      }
      else key = null;
      return token;
    }
    const monetary = moneyKeys.has(key); key = null;
    return monetary ? JSON.stringify(token) : token;
  });
  return JSON.parse(preserved);
}
