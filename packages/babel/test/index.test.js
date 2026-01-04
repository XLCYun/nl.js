const babel = require('@babel/core');
const plugin = require('../index.js');

/**
 * Count the number of eval(__NLJS_CORE.generate calls in the code
 * @param {string} code - The code to check
 * @returns {number} The number of eval calls
 */
function countEvalCalls(code) {
  return (code.match(/eval\(__NLJS_CORE\.generate/g) || []).length;
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
    expect(result.code).toContain('eval(__NLJS_CORE.generate');
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
    expect(result.code).not.toContain('eval(__NLJS_CORE.generate');
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
    expect(result.code).toContain('eval(__NLJS_CORE.generate');
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
    expect(result.code).toContain('eval(__NLJS_CORE.generate');
    // Check that there are three eval calls
    expect(countEvalCalls(result.code)).toBe(3);
  });
});

