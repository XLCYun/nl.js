/**
 * Gather all accessible variables from the current scope and assemble them into an object expression
 * @param {Object} t - Babel types
 * @param {Object} path - Babel path (usually the path of TaggedTemplateExpression node)
 * @returns {Object} Returns an object expression like { var1, var2, var3 }
 */
function gatherScopeVars(t, path) {
  const properties = []
  const seenVars = new Set()
  
  // Get all bindings from current scope and all parent scopes
  // getAllBindings() returns all accessible variables including those from outer scopes
  const bindings = path.scope.getAllBindings()
  
  // Get the current TaggedTemplateExpression's start position
  const currentStart = path.node.start
  
  // Iterate through all bindings and create object properties
  for (const varName in bindings) {
    // Skip internal variables that start with __
    if (varName.startsWith('__')) {
      continue
    }
    
    // Skip if we've already added this variable (to avoid duplicates)
    if (seenVars.has(varName)) {
      continue
    }
    
    const binding = bindings[varName]
    if (!binding || !binding.path || !binding.path.node) {
      continue
    }
    
    const node = binding.path.node
    
    // Skip functions - only keep variables
    if (t.isFunctionDeclaration(node) || 
        t.isFunctionExpression(node) || 
        t.isArrowFunctionExpression(node)) {
      continue
    }
    
    // Only include variables that are declared before the current nl`` expression
    // This prevents "Cannot access before initialization" errors
    // For variable declarations, check the end position of the declaration
    let declarationEnd = null
    
    if (t.isVariableDeclarator(node)) {
      // If the node is a VariableDeclarator, get its parent VariableDeclaration
      const parentPath = binding.path.parentPath
      if (parentPath && parentPath.node && parentPath.node.end) {
        declarationEnd = parentPath.node.end
      }
    } else if (node.end) {
      // For other declaration types, use the node's end position
      declarationEnd = node.end
    }
    
    // Skip if we can't determine the declaration position, or if it's declared after current expression
    if (declarationEnd === null || declarationEnd >= currentStart) {
      continue
    }
    
    seenVars.add(varName)
    
    // Create object property: { varName: varName }
    // Using shorthand property syntax: { var1 } instead of { var1: var1 }
    properties.push(t.objectProperty(
      t.identifier(varName),
      t.identifier(varName),
      false, // computed
      true   // shorthand
    ))
  }
  
  // Return object expression
  return t.objectExpression(properties)
}

module.exports = { gatherScopeVars };

