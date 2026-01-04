/**
 * Check if a specified variable is declared in the global scope of the file
 * Supports const, let, and var declaration types
 * @param {Object} t - Babel types
 * @param {Object} path - Babel path (usually the path of Program node)
 * @param {string} varName - The variable name to check, e.g. '__NLJS_GLOBAL', '__NLJS_CORE'
 * @returns {boolean} Returns true if the variable declaration exists, otherwise returns false
 */
function checkProgramVar(t, path, varName) {
  let found = false;

  // Only check direct children of Program node (global scope)
  path.node.body.forEach(statement => {
    if (t.isVariableDeclaration(statement)) {
      // Check const, let, and var declaration types
      statement.declarations.forEach(declarator => {
        // Check if the variable name matches
        if (t.isIdentifier(declarator.id, { name: varName })) {
          found = true;
        }
      });
    }
  });

  return found;
}

module.exports = { checkProgramVar };

