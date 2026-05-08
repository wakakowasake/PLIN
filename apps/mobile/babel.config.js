module.exports = function babelConfig(api) {
    api.cache(true);

    return {
        presets: ['babel-preset-expo'],
        plugins: [
            ['module-resolver', {
                alias: {
                    '@': './src',
                    '@shared': '../../shared'
                },
                extensions: ['.ts', '.tsx', '.js', '.json']
            }]
        ]
    };
};
