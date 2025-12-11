const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = (env) => {
  const target = env.target || 'chrome';
  const manifestFile = target === 'firefox' ? 'manifest-firefox.json' : 'manifest-chrome.json';
  
  return {
    entry: {
      background: './src/background.js',
      content: './src/content.js'
    },
    output: {
      path: path.resolve(__dirname, `dist-${target}`),
      filename: '[name].js',
      clean: true
    },
    module: {
      rules: [
        {
          test: /\.js$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: ['@babel/preset-env']
            }
          }
        }
      ]
    },
    plugins: [
      new CopyPlugin({
        patterns: [
          { from: manifestFile, to: 'manifest.json' },
          { from: 'icons', to: 'icons', noErrorOnMissing: true }
        ]
      })
    ]
  };
};
