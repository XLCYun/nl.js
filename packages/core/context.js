

class Context {
    constructor({ module, scope, source }){
        this.module = module;
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
            maskContext: `${contextBefore}(async function () {/* __NLJS_ASYNC_FUNC_BODY__ */})()${contextAfter}`
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
        
        在上下文代码中，/* __NLJS_ASYNC_FUNC_BODY__ */ 标记了待生成的异步函数体位置，该代码的功能描述为：
        ${nlBlock}
        
        请根据代码功能描述，以及当前运行时的作用域变量及其取值，生成对应的 JavaScript 代码。
        
        请注意：
        1. 只生成异步函数内部的代码，不要包含外层 async function 定义或立即执行包装。需要提供片段结果时使用 return，函数体内允许使用 await。
        2. 生成的代码中，不允许包含 nl\`\` 标签，因为它不是可以直接执行的 JavaScript 代码
        3. 每轮只调用一次 final_output 工具，将代码放入 asyncFuncBody 字符串字段，例如 {"asyncFuncBody":"return a + b;"}，不要额外嵌套 output 对象。
        4. 不要在普通回复正文中提交代码，不要使用 Markdown 代码块或 XML 标签包裹提交的代码。
        5. final_output 是用于提交生成代码的工具，不是生成的函数体中需要调用的函数；收到错误反馈后可以修正并重新提交；有效提交后本次代码生成结束。`;
    }
}

module.exports = {
    Context
}
