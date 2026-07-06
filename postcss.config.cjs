// CJS on purpose: importing @pandacss/dev/postcss from an ESM config file
// hits the CJS double-default interop problem under moduleResolution nodenext.
// String-based resolution via postcss-load-config sidesteps it entirely.
module.exports = {
  plugins: {
    "@pandacss/dev/postcss": {},
  },
};
