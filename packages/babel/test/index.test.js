const babel = require('@babel/core');
const plugin = require('../index.js');

/**
 * Count the number of eval(__NLJS_CORE.generate calls in the code
 * @param {string} code - The code to check
 * @returns {number} The number of eval calls
 */
function countEvalCalls(code) {
  return (code.match(/eval\(await\s+__NLJS_CORE\.generate/g) || []).length;
}

describe('@nljs/babel plugin tests', () => {
  test('Should not introduce __NLJS_CORE when nl`` does not exist in code', () => {
    const code = `
      function test() {
        console.log("normal log");
        const x = 1;
      }
    `;

    const result = babel.transformSync(code, {
      plugins: [plugin]
    });

    // Check that the transformed code does not contain __NLJS_CORE
    expect(result.code).not.toContain('__NLJS_CORE');
    expect(result.code).not.toContain('require("@nljs/core")');
  });

  test('Should introduce __NLJS_CORE when one nl`` exists in code', () => {
    const code = `
      function test() {
        nl\`some template\`;
        console.log("normal log");
      }
    `;

    const result = babel.transformSync(code, {
      plugins: [plugin]
    });

    // Check that the transformed code contains __NLJS_CORE
    expect(result.code).toContain('var __NLJS_CORE = require("@nljs/core")');
    // Check that nl`` is converted to eval
    expect(result.code).toContain('eval(await __NLJS_CORE.generate');
    // Check that it is only introduced once
    const requireCount = (result.code.match(/var __NLJS_CORE = require\("@nljs\/core"\)/g) || []).length;
    expect(requireCount).toBe(1);
    // Check that there is only one eval call
    expect(countEvalCalls(result.code)).toBe(1);
  });

  test('Should only introduce one __NLJS_CORE when two nl`` exist in code', () => {
    const code = `
      function test() {
        nl\`first template\`;
        nl\`second template\`;
        console.log("normal log");
      }
    `;

    const result = babel.transformSync(code, {
      plugins: [plugin]
    });

    // Check that the transformed code contains __NLJS_CORE
    expect(result.code).toContain('var __NLJS_CORE = require("@nljs/core")');
    // Check that it is only introduced once
    const requireCount = (result.code.match(/var __NLJS_CORE = require\("@nljs\/core"\)/g) || []).length;
    expect(requireCount).toBe(1);
    // Check that both nl`` are converted to eval
    expect(countEvalCalls(result.code)).toBe(2);
  });

  test('Should not inject __NLJS_GLOBAL when nl`` does not exist in code', () => {
    const code = `
      function test() {
        console.log("normal log");
        const x = 1;
      }
    `;

    const result = babel.transformSync(code, {
      plugins: [plugin]
    });

    // Check that the transformed code does not contain __NLJS_GLOBAL
    expect(result.code).not.toContain('__NLJS_GLOBAL');
  });

  test('Should inject __NLJS_GLOBAL when nl`` exists in code', () => {
    const code = `
      function test() {
        nl\`some template\`;
        console.log("normal log");
      }
    `;

    const result = babel.transformSync(code, {
      plugins: [plugin]
    });

    // Check that the transformed code contains __NLJS_GLOBAL
    expect(result.code).toContain('__NLJS_GLOBAL');
    // Check the declaration format of __NLJS_GLOBAL
    expect(result.code).toContain('var __NLJS_GLOBAL = {');
    // Check that it is only injected once
    const globalCount = (result.code.match(/var __NLJS_GLOBAL = \{/g) || []).length;
    expect(globalCount).toBe(1);
  });

  test('Should not insert eval when nl`` does not exist in code', () => {
    const code = `
      function test() {
        console.log("normal log");
        const x = 1;
      }
    `;

    const result = babel.transformSync(code, {
      plugins: [plugin]
    });

    // Check that the transformed code does not contain eval
    expect(result.code).not.toContain('eval(await __NLJS_CORE.generate');
  });

  test('Should insert one eval when one nl`` exists in code', () => {
    const code = `
      function test() {
        nl\`some template\`;
        console.log("normal log");
      }
    `;

    const result = babel.transformSync(code, {
      plugins: [plugin]
    });

    // Check that the transformed code contains eval
    expect(result.code).toContain('eval(await __NLJS_CORE.generate');
    // Check that there is only one eval call
    expect(countEvalCalls(result.code)).toBe(1);
  });

  test('Should insert eval for each nl`` when multiple nl`` exist in code', () => {
    const code = `
      function test() {
        nl\`first template\`;
        nl\`second template\`;
        nl\`third template\`;
        console.log("normal log");
      }
    `;

    const result = babel.transformSync(code, {
      plugins: [plugin]
    });

    // Check that the transformed code contains eval
    expect(result.code).toContain('eval(await __NLJS_CORE.generate');
    // Check that there are three eval calls
    expect(countEvalCalls(result.code)).toBe(3);
  });

  describe('gatherScopeVars tests', () => {
    /**
     * Extract scope object from the generated code
     * @param {string} code - The transformed code
     * @returns {string} The scope object string (normalized, without whitespace)
     */
    function extractScope(code) {
      // Match scope: { ... } pattern, handling multiline and whitespace
      const match = code.match(/scope:\s*\{([^}]*)\}/s);
      if (!match) return '';
      // Remove all whitespace and normalize
      return match[1].replace(/\s/g, '');
    }

    /**
     * Check if a variable name exists in the scope string
     * @param {string} scope - The normalized scope string
     * @param {string} varName - The variable name to check
     * @returns {boolean}
     */
    function hasVariable(scope, varName) {
      // Check for variable name as a standalone identifier (not part of another name)
      const regex = new RegExp(`(^|[,])${varName}([,]|$)`);
      return regex.test(scope);
    }

    test('Should gather variables from global scope', () => {
      const code = `
        const globalVar1 = 1;
        let globalVar2 = 2;
        var globalVar3 = 3;
        nl\`template\`;
      `;

      const result = babel.transformSync(code, {
        plugins: [plugin]
      });

      const scope = extractScope(result.code);
      // Check that global variables are included
      expect(hasVariable(scope, 'globalVar1')).toBe(true);
      expect(hasVariable(scope, 'globalVar2')).toBe(true);
      expect(hasVariable(scope, 'globalVar3')).toBe(true);
      // Check that internal variables are excluded
      expect(hasVariable(scope, '__NLJS_CORE')).toBe(false);
      expect(hasVariable(scope, '__NLJS_GLOBAL')).toBe(false);
    });

    test('Should gather variables from function scope', () => {
      const code = `
        const globalVar = 1;
        function test() {
          const funcVar1 = 10;
          let funcVar2 = 20;
          var funcVar3 = 30;
          nl\`template\`;
        }
      `;

      const result = babel.transformSync(code, {
        plugins: [plugin]
      });

      const scope = extractScope(result.code);
      // Check that function-scoped variables are included
      expect(hasVariable(scope, 'funcVar1')).toBe(true);
      expect(hasVariable(scope, 'funcVar2')).toBe(true);
      expect(hasVariable(scope, 'funcVar3')).toBe(true);
      // Check that global variables accessible in function scope are included
      expect(hasVariable(scope, 'globalVar')).toBe(true);
      // Check that internal variables are excluded
      expect(hasVariable(scope, '__NLJS_CORE')).toBe(false);
      expect(hasVariable(scope, '__NLJS_GLOBAL')).toBe(false);
    });

    test('Should gather variables from block scope', () => {
      const code = `
        const globalVar = 1;
        function test() {
          const funcVar = 10;
          if (true) {
            const blockVar1 = 100;
            let blockVar2 = 200;
            nl\`template\`;
          }
        }
      `;

      const result = babel.transformSync(code, {
        plugins: [plugin]
      });

      const scope = extractScope(result.code);
      // Check that block-scoped variables are included
      expect(hasVariable(scope, 'blockVar1')).toBe(true);
      expect(hasVariable(scope, 'blockVar2')).toBe(true);
      // Check that outer scope variables are also included
      expect(hasVariable(scope, 'funcVar')).toBe(true);
      expect(hasVariable(scope, 'globalVar')).toBe(true);
      // Check that internal variables are excluded
      expect(hasVariable(scope, '__NLJS_CORE')).toBe(false);
      expect(hasVariable(scope, '__NLJS_GLOBAL')).toBe(false);
    });

    test('Should gather variables from nested function scope', () => {
      const code = `
        const globalVar = 1;
        function outer() {
          const outerVar = 10;
          function inner() {
            const innerVar1 = 100;
            let innerVar2 = 200;
            var innerVar3 = 300;
            nl\`template\`;
          }
        }
      `;

      const result = babel.transformSync(code, {
        plugins: [plugin]
      });

      const scope = extractScope(result.code);
      // Check that inner function variables are included
      expect(hasVariable(scope, 'innerVar1')).toBe(true);
      expect(hasVariable(scope, 'innerVar2')).toBe(true);
      expect(hasVariable(scope, 'innerVar3')).toBe(true);
      // Check that outer function variables are included
      expect(hasVariable(scope, 'outerVar')).toBe(true);
      // Check that global variables are included
      expect(hasVariable(scope, 'globalVar')).toBe(true);
      // Check that internal variables are excluded
      expect(hasVariable(scope, '__NLJS_CORE')).toBe(false);
      expect(hasVariable(scope, '__NLJS_GLOBAL')).toBe(false);
    });

    test('Should not include variables from sibling scopes', () => {
      const code = `
        function test1() {
          const var1 = 1;
        }
        function test2() {
          const var2 = 2;
          nl\`template\`;
        }
      `;

      const result = babel.transformSync(code, {
        plugins: [plugin]
      });

      const scope = extractScope(result.code);
      // Check that variables from the same function are included
      expect(hasVariable(scope, 'var2')).toBe(true);
      // Check that variables from sibling function are not included
      expect(hasVariable(scope, 'var1')).toBe(false);
    });

    test('Should handle for loop block scope', () => {
      const code = `
        const globalVar = 1;
        for (let i = 0; i < 10; i++) {
          const loopVar = i * 2;
          nl\`template\`;
        }
      `;

      const result = babel.transformSync(code, {
        plugins: [plugin]
      });

      const scope = extractScope(result.code);
      // Check that loop-scoped variables are included
      expect(hasVariable(scope, 'i')).toBe(true);
      expect(hasVariable(scope, 'loopVar')).toBe(true);
      // Check that global variables are included
      expect(hasVariable(scope, 'globalVar')).toBe(true);
    });

    test('Should only include variables declared before the current nl`` expression', () => {
      const code = `
        const beforeVar = 1;
        const currentVar = nl\`template\`;
        const afterVar = 2;
      `;

      const result = babel.transformSync(code, {
        plugins: [plugin]
      });

      // Extract scope from the first nl`` (currentVar assignment)
      const scopes = result.code.match(/scope:\s*\{([^}]*)\}/g);
      expect(scopes).toBeTruthy();
      expect(scopes.length).toBeGreaterThan(0);
      
      const firstScope = extractScope(scopes[0]);
      // Check that variable declared before nl`` is included
      expect(hasVariable(firstScope, 'beforeVar')).toBe(true);
      // Check that variable being assigned (currentVar) is NOT included
      expect(hasVariable(firstScope, 'currentVar')).toBe(false);
      // Check that variable declared after nl`` is NOT included
      expect(hasVariable(firstScope, 'afterVar')).toBe(false);
    });

    test('Should prevent "Cannot access before initialization" error', () => {
      const code = `
        async function main() {
          const userChoice = nl\`get user choice\`;
          const computerChoice = nl\`generate choice\`;
        }
      `;

      const result = babel.transformSync(code, {
        plugins: [plugin]
      });

      // Extract all scopes
      const scopes = result.code.match(/scope:\s*\{([^}]*)\}/g);
      expect(scopes).toBeTruthy();
      expect(scopes.length).toBe(2);
      
      // First nl`` (userChoice assignment)
      const firstScope = extractScope(scopes[0]);
      // Should not include userChoice (it's being assigned) or computerChoice (not yet declared)
      expect(hasVariable(firstScope, 'userChoice')).toBe(false);
      expect(hasVariable(firstScope, 'computerChoice')).toBe(false);
      
      // Second nl`` (computerChoice assignment)
      const secondScope = extractScope(scopes[1]);
      // Should include userChoice (declared before), but not computerChoice (being assigned)
      expect(hasVariable(secondScope, 'userChoice')).toBe(true);
      expect(hasVariable(secondScope, 'computerChoice')).toBe(false);
    });

    test('Should handle sequential variable declarations with nl``', () => {
      const code = `
        const var1 = 1;
        const var2 = nl\`template1\`;
        const var3 = 2;
        const var4 = nl\`template2\`;
        const var5 = 3;
      `;

      const result = babel.transformSync(code, {
        plugins: [plugin]
      });

      const scopes = result.code.match(/scope:\s*\{([^}]*)\}/g);
      expect(scopes).toBeTruthy();
      expect(scopes.length).toBe(2);
      
      // First nl`` (var2 assignment)
      const firstScope = extractScope(scopes[0]);
      expect(hasVariable(firstScope, 'var1')).toBe(true);
      expect(hasVariable(firstScope, 'var2')).toBe(false);
      expect(hasVariable(firstScope, 'var3')).toBe(false);
      expect(hasVariable(firstScope, 'var4')).toBe(false);
      expect(hasVariable(firstScope, 'var5')).toBe(false);
      
      // Second nl`` (var4 assignment)
      const secondScope = extractScope(scopes[1]);
      expect(hasVariable(secondScope, 'var1')).toBe(true);
      expect(hasVariable(secondScope, 'var2')).toBe(true);
      expect(hasVariable(secondScope, 'var3')).toBe(true);
      expect(hasVariable(secondScope, 'var4')).toBe(false);
      expect(hasVariable(secondScope, 'var5')).toBe(false);
    });

    test('Should exclude functions from scope', () => {
      const code = `
        const myVar = 1;
        function myFunc() {
          return 2;
        }
        const myVar2 = nl\`template\`;
      `;

      const result = babel.transformSync(code, {
        plugins: [plugin]
      });

      const scope = extractScope(result.code);
      // Check that variables are included
      expect(hasVariable(scope, 'myVar')).toBe(true);
      expect(hasVariable(scope, 'myVar2')).toBe(false);
      // Check that functions are excluded
      expect(hasVariable(scope, 'myFunc')).toBe(false);
    });

    test('Should handle let and var declarations correctly', () => {
      const code = `
        let letVar = 1;
        var varVar = 2;
        const constVar = nl\`template\`;
        let letVar2 = 3;
      `;

      const result = babel.transformSync(code, {
        plugins: [plugin]
      });

      const scope = extractScope(result.code);
      // Variables declared before nl`` should be included
      expect(hasVariable(scope, 'letVar')).toBe(true);
      expect(hasVariable(scope, 'varVar')).toBe(true);
      // Variable being assigned should not be included
      expect(hasVariable(scope, 'constVar')).toBe(false);
      // Variable declared after should not be included
      expect(hasVariable(scope, 'letVar2')).toBe(false);
    });
  });
});

