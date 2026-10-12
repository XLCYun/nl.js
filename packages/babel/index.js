const template = require("@babel/template").default
const { checkProgramVar } = require("./helpers/checkProgramVar")
const { gatherScopeVars } = require("./helpers/gatherScopeVars")

module.exports = function ({ types: t }, options = {}) {
  const buildRequireCore = template('var __NLJS_CORE = require(%%runtimeModule%%)', {
    syntacticPlaceholders: true
  })
  const buildModuleVar = template(`var __NLJS_MODULE = { sourceCode: %%sourceCode%%, vars: {} }`, {
    syntacticPlaceholders: true
  })
  const buildEval = template(
    `await eval(await __NLJS_CORE.generate({ module: __NLJS_MODULE, scope: %%scope%%, source: { code: __NLJS_MODULE.sourceCode, start: %%start%%, end: %%end%% } }))`,
    { syntacticPlaceholders: true }
  )

  return {
    name: "@nljs/babel",
    visitor: {
      Program(path) {
        // Check if nl`` TaggedTemplateExpression exists
        let hasNlTag = false
        path.traverse({
          TaggedTemplateExpression(templatePath) {
            if (t.isIdentifier(templatePath.node.tag, { name: "nl" })) {
              hasNlTag = true
              templatePath.stop() // Stop traversal after finding it
            }
          }
        })
        if (!hasNlTag) return

        // Get the original source code (path.hub.file.code contains the unprocessed original source code)
        const sourceCode = path.hub && path.hub.file && path.hub.file.code ? path.hub.file.code : ""

        // Check if __NLJS_CORE variable declaration exists in the current source file
        const hasRequire = checkProgramVar(t, path, "__NLJS_CORE")

        // If not found, add the require statement
        if (!hasRequire) {
          const runtimeModule = t.stringLiteral(options.runtimeModule || "@nljs/core")
          // The CLI supplies an installed runtime path and uses native imports
          // for ESM. Babel consumers keep the original require-based default.
          const requireStatement = options.runtimeImport
            ? t.importDeclaration([t.importDefaultSpecifier(t.identifier("__NLJS_CORE"))], runtimeModule)
            : buildRequireCore({ runtimeModule })
          // Add the require statement to the beginning of the file
          path.node.body.unshift(requireStatement)
        }

        // Check if __NLJS_MODULE variable declaration exists in the current source file
        const hasModule = checkProgramVar(t, path, "__NLJS_MODULE")

        // If not found, add the per-module context declaration
        if (!hasModule) {
          const moduleStatement = buildModuleVar({ sourceCode: t.stringLiteral(sourceCode) })
          // Add the per-module context declaration to the beginning of the file
          path.node.body.unshift(moduleStatement)
        }
      },
      TaggedTemplateExpression(path) {
        // Check if the tag is 'nl'
        if (t.isIdentifier(path.node.tag, { name: "nl" })) {
          if (options.validateAsyncContext) {
            const parentFunction = path.getFunctionParent()
            const isAsync = parentFunction
              ? parentFunction.node.async
              : path.findParent(parent => parent.isProgram()).node.sourceType === "module"
            if (!isAsync) {
              throw path.buildCodeFrameError("nl fragments require an async function or the top level of an ES module")
            }
          }
          // Convert to eval( ... )
          path.replaceWith(buildEval({ 
            scope: gatherScopeVars(t, path),
            start: t.numericLiteral(path.node.start), 
            end: t.numericLiteral(path.node.end) 
          }))
        }
      }
    }
  }
}
