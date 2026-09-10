module.exports = {
  appId: 'br.thebridge.app', productName: 'T.H.E.B.R.I.D.G.E',
  directories: { output: 'release' },
  files: ['desktop/**/*', 'web/**/*', 'package.json'],
  extraResources: [{ from: 'native/bin/BridgeInput.exe', to: 'BridgeInput.exe' }],
  win: { target: 'portable', artifactName: 'THE-BRIDGE-${version}-Windows.${ext}', icon: 'native/bin/bridge.ico', signExecutable: false }
};
