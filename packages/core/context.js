

class Context {
    constructor({ global, scope, source }){
        this.global = global;
        this.scope = scope;
        this.source = source;
        this.code = source.code;
        this.start = source.start;
        this.end = source.end;

        this.extracted = false;
        this.extractedResult = null
    }

    extractContext() {
        if (this.extracted) {
            return this.extractedResult;
        }

        // 提取自然语言块的内容
        const nlBlock = this.code.substring(this.start, this.end);

        // 提取自然语言块前后的上下文代码
        // 暂时不限制上下文代码的长度
        const contextBefore = this.code.substring(0, this.start);
        const contextAfter = this.code.substring(this.end, this.code.length);

        this.extracted = true;
        this.extractedResult = {
            before: contextBefore,
            nlBlock: nlBlock,
            after: contextAfter,
            fullContext: `${contextBefore}${nlBlock}${contextAfter}`,
            maskContext: `${contextBefore}(async function () {<nl></nl>})()${contextAfter}`
        };

        return this.extractedResult;
    }

    getPrompt() {
        const { maskContext, nlBlock } = this.extractContext();
        return  `你是一个代码生成助手。请根据以下上下文代码，生成对应的 JavaScript 代码。

        上下文代码：
        \`\`\`javascript
        ${maskContext}
        \`\`\`
        
        当前的作用域变量及其取值如下：
        \`\`\`json
        ${JSON.stringify(this.scope)}
        \`\`\`
        
        在上下文代码中，<nl></nl> 标签内应该是一段生成的 JavaScript 代码，该代码的功能描述为：
        ${nlBlock}
        
        请根据代码功能描述，以及当前运行时的作用域变量及其取值，生成对应的 JavaScript 代码。
        
        请注意：
        1. 根据情况，直接返回 true, false, number, string 等基本类型值是允许的
        2. 生成的代码中，不允许包含 nl\`\` 标签，因为它不是可以直接执行的 JavaScript 代码
        3. 生成的代码**必需**用 <nl></nl> 标签包裹起来。`;
    }
}

module.exports = {
    Context
}