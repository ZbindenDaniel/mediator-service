const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'frontend', 'public');
const dest = path.join(__dirname, '..', 'dist', 'frontend', 'public');

if (fs.existsSync(src)) {
  fs.mkdirSync(dest, { recursive: true });
  const copy = (s, d) => {
    for (const f of fs.readdirSync(s)) {
      const sp = path.join(s, f);
      const dp = path.join(d, f);
      if (fs.statSync(sp).isDirectory()) {
        fs.mkdirSync(dp, { recursive: true });
        copy(sp, dp);
      } else {
        fs.copyFileSync(sp, dp);
      }
    }
  };
  copy(src, dest);
  console.log('Copied frontend public to', dest);
} else {
  console.log('No frontend public to copy at', src);
}
