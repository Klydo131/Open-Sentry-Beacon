// Turn the `accessor` keyword into something webpack's parser can read.
//
// ---------------------------------------------------------------------------
// WHAT THIS IS FOR. Twenty-five @blocksuite packages ship compiled output using
// `accessor` class fields, from the decorators proposal:
//
//     accessor color = __runInitializers(this, _color_initializers, ...);
//
// Neither webpack's own parser nor Next's SWC can read it. Webpack reports the
// syntax error against whichever filename module concatenation happened to be
// holding at the time -- which is how this presented as a CSS problem in a
// completely different package, twice.
//
// esbuild reads it and lowers it, so one esbuild pass over @blocksuite's
// compiled files is the whole fix. Nothing else in the app goes through here.
// ---------------------------------------------------------------------------
const { transform } = require('esbuild');

module.exports = function accessorLoader(source) {
  const done = this.async();
  transform(source, {
    // es2020 is below the `accessor` proposal, so esbuild lowers it to a
    // getter/setter pair rather than passing it through.
    target: 'es2020',
    format: 'esm',
    loader: 'js',
    sourcefile: this.resourcePath,
  }).then(
    (out) => done(null, out.code),
    (err) => done(err),
  );
};
