/**
 * Babel plugin to transform import.meta for Metro bundler
 * This replaces import.meta with a polyfilled object
 */
module.exports = function ({ types: t }) {
  return {
    name: 'transform-import-meta',
    visitor: {
      MetaProperty(path) {
        // Only transform import.meta
        if (
          path.node.meta.name === 'import' &&
          path.node.property.name === 'meta'
        ) {
          // Replace import.meta with a safe object
          path.replaceWith(
            t.objectExpression([
              t.objectProperty(
                t.identifier('url'),
                t.conditionalExpression(
                  t.binaryExpression(
                    '!==',
                    t.unaryExpression('typeof', t.identifier('window')),
                    t.stringLiteral('undefined')
                  ),
                  t.memberExpression(
                    t.memberExpression(t.identifier('window'), t.identifier('location')),
                    t.identifier('href')
                  ),
                  t.stringLiteral('')
                )
              ),
              t.objectProperty(
                t.identifier('env'),
                t.objectExpression([])
              ),
            ])
          );
        }
      },
    },
  };
};

