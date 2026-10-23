const ASSET_EXT = /\.(png|jpe?g|gif|webp|svg|woff2?|ttf|mp4)$/i;

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/i.test(specifier)) {
      try {
        return await nextResolve(`${specifier}.ts`, context);
      } catch {
        return nextResolve(`${specifier}.tsx`, context);
      }
    }
    throw error;
  }
}

export async function load(url, context, nextLoad) {
  if (ASSET_EXT.test(url)) {
    return {
      format: "module",
      source: 'export default "asset";\n',
      shortCircuit: true,
    };
  }
  return nextLoad(url, context);
}
