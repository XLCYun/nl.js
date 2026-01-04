const template = require("@babel/template").default
const { checkProgramVar } = require("./helpers/checkProgramVar")

module.exports = function ({ types: t }) {
  const buildRequireCore = template('var __NLJS_CORE = require("@nljs/core")', {
    placeholderPattern: false
  })
  const buildGlobalVar = template(`var __NLJS_GLOBAL = { sourceCode: %%sourceCode%%, vars: {} }`, {
    syntacticPlaceholders: true
  })
  const buildEval = template(
    `eval(await __NLJS_CORE.generate({ global: __NLJS_GLOBAL, source: { code: __NLJS_GLOBAL.sourceCode, start: %%start%%, end: %%end%% } }))`,
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
          const requireStatement = buildRequireCore()
          // Add the require statement to the beginning of the file
          path.node.body.unshift(requireStatement)
        }

        // Check if __NLJS_GLOBAL variable declaration exists in the current source file
        const hasGlobal = checkProgramVar(t, path, "__NLJS_GLOBAL")

        // If not found, add the global variable declaration
        if (!hasGlobal) {
          const globalStatement = buildGlobalVar({ sourceCode: t.stringLiteral(sourceCode) })
          // Add the global variable declaration to the beginning of the file
          path.node.body.unshift(globalStatement)
        }
      },
      TaggedTemplateExpression(path) {
        // Check if the tag is 'nl'
        if (t.isIdentifier(path.node.tag, { name: "nl" })) {
          // Convert to eval( ... )
          path.replaceWith(buildEval({ 
            start: t.numericLiteral(path.node.start), 
            end: t.numericLiteral(path.node.end) 
          }))
        }
      }
    }
  }
}
