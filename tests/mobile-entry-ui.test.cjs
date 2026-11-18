const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

test('la cuenta móvil protege la apertura mientras recupera la sesión segura', () => {
  const mobile = path.join(__dirname, '../mobile/trainerspoint');
  const React = require(require.resolve('react', { paths: [mobile] }));
  const renderToStaticMarkup = require(require.resolve('react-dom/server', { paths: [mobile] })).renderToStaticMarkup;
  const file = path.join(mobile, 'src/AccountApp.tsx');
  const previousExtension = require.extensions['.tsx'];
  const previousLoad = Module._load;
  require.extensions['.tsx'] = (mod, filename) => {
    const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    });
    mod._compile(compiled.outputText, filename);
  };
  Module._load = function(request, parent, isMain) {
    if (parent?.filename === file) {
      if (request === 'react-native') return { StyleSheet: { create: value => value }, Platform: { OS: 'web' }, ActivityIndicator: () => null, Text: props => React.createElement('span', null, props.children), View: props => React.createElement('div', null, props.children) };
      if (request === 'expo-status-bar') return { StatusBar: () => null };
      if (request === 'react-native-safe-area-context') return { SafeAreaView: props => React.createElement('div', null, props.children) };
      if (request === './screens/LoginScreen') return { LoginScreen: () => React.createElement('div', null, 'Formulario de acceso') };
      if (request === './screens/StaffScreen') return { StaffScreen: () => null };
      if (request === './screens/TrainerScreen') return { TrainerScreen: () => null };
      if (request === './screens/ClientHomeScreen') return { default: () => null };
      if (request === '../../shared/config') return { apiBaseUrl: () => '' };
      if (request === '../../shared/cognito') return { mobileCognito: () => undefined };
      if (request === '../../shared/api') return { ApiClient: class {} };
      if (request === './trainer-push') return { unregisterTrainerPush: async () => {} };
      if (request === './session-store') return { sessionStore: { get: async () => null, set: async () => {} } };
    }
    return previousLoad.call(this, request, parent, isMain);
  };
  try {
    delete require.cache[file];
    const AccountApp = require(file).default;
    const html = renderToStaticMarkup(React.createElement(AccountApp, { onBack() {} }));
    assert.match(html, /Recuperando sesión segura/);
    assert.doesNotMatch(html, /Formulario de acceso/);
  } finally {
    Module._load = previousLoad;
    require.extensions['.tsx'] = previousExtension;
    delete require.cache[file];
  }
});
