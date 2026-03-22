// 国学AI助手云函数 - 调用微信云开发AI能力
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

// 系统提示词 - 国学AI助手角色
const SYSTEM_PROMPT = `你是一位博学多才的国学大师，精通中国传统文化。你的名字叫"文渊先生"。
你的专长包括：
1. 诗词鉴赏：能赏析唐诗宋词元曲，解读意境与典故
2. 古文翻译：能将文言文翻译成现代白话文，并解释语法结构
3. 成语释义：能讲解成语出处、故事与用法
4. 历史知识：能讲解历史人物、朝代更迭、重大事件
5. 典籍解读：能讲解四书五经、诸子百家等经典著作
6. 汉字文化：能讲解汉字的演变、结构与文化内涵

回答风格：
- 学识渊博但语言平易近人
- 适当引用经典原文，并给出翻译
- 善于用现代视角诠释传统文化
- 回答要有深度但通俗易懂
- 适当使用小故事和典故来说明问题
- 回答长度适中，重点突出

请用中文回答，融入传统文化的智慧，帮助用户领略国学之美。`;

exports.main = async (event, context) => {
  const { type, messages, text, mode } = event;
  
  try {
    // AI对话
    if (type === 'chat') {
      return await handleChat(messages);
    }
    
    // 古文翻译
    if (type === 'translate') {
      return await handleTranslate(text, mode);
    }
    
    // 每日经典推荐
    if (type === 'daily') {
      return await handleDailyClassic();
    }
    
    // 诗词解析
    if (type === 'poem') {
      return await handlePoemAnalysis(text);
    }
    
    // 成语解释
    if (type === 'idiom') {
      return await handleIdiomExplain(text);
    }
    
    // 历史知识
    if (type === 'history') {
      return await handleHistory(text);
    }

    // 流式对话
    if (type === 'stream') {
      return await handleStreamChat(messages);
    }
    
    return { success: false, error: '未知请求类型' };
  } catch (error) {
    console.error('云函数错误:', error);
    return { 
      success: false, 
      error: error.message || '服务暂时不可用，请稍后重试' 
    };
  }
};

// 处理AI对话
async function handleChat(messages) {
  const formattedMessages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }))
  ];
  
  const result = await cloud.ai.inference.completions({
    model: 'hunyuan-turbos-latest',
    messages: formattedMessages,
    temperature: 0.8,
    max_tokens: 2000
  });
  
  const reply = result.choices[0].message.content;
  return { success: true, reply };
}

// 处理古文翻译
async function handleTranslate(text, mode) {
  let prompt = '';
  if (mode === 'ancient_to_modern') {
    prompt = `请将以下文言文翻译成现代白话文，并进行详细注释：
    
文言文：${text}

请按以下格式回答：
【现代白话文】
[翻译内容]

【重点词汇注释】
[关键字词解释]

【文化背景】
[相关历史文化背景简介]`;
  } else {
    prompt = `请将以下现代白话文改写成古典文言文风格，并解释用词：

现代文：${text}

请按以下格式回答：
【文言文版本】
[文言文内容]

【用词说明】
[主要文言词汇解释]`;
  }
  
  const result = await cloud.ai.inference.completions({
    model: 'hunyuan-turbos-latest',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt }
    ],
    temperature: 0.5,
    max_tokens: 2000
  });
  
  return { 
    success: true, 
    result: result.choices[0].message.content 
  };
}

// 每日经典推荐
async function handleDailyClassic() {
  const today = new Date();
  const dateStr = `${today.getFullYear()}年${today.getMonth()+1}月${today.getDate()}日`;
  
  const prompt = `今天是${dateStr}，请为我推荐一首适合今日的经典诗词或名言警句。

请按以下格式回答：
【今日经典】
[经典原文]

【作者朝代】
[作者名 · 朝代]

【白话赏析】
[用简洁的现代文解释诗词含义和意境，100字以内]

【今日启示】
[结合现代生活给出简短的人生感悟，50字以内]`;

  const result = await cloud.ai.inference.completions({
    model: 'hunyuan-turbos-latest',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt }
    ],
    temperature: 0.9,
    max_tokens: 1000
  });
  
  return { 
    success: true, 
    daily: result.choices[0].message.content 
  };
}

// 诗词解析
async function handlePoemAnalysis(text) {
  const prompt = `请对以下诗词进行深度赏析：

${text}

请按以下格式回答：
【作品信息】
[朝代、作者、创作背景]

【全文注释】
[逐句注释，解释难懂的字词]

【意境赏析】
[分析诗词的意境、情感与艺术手法]

【文化价值】
[说明这首诗词在中国文学史上的地位与影响]`;

  const result = await cloud.ai.inference.completions({
    model: 'hunyuan-turbos-latest',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt }
    ],
    temperature: 0.7,
    max_tokens: 2000
  });
  
  return { 
    success: true, 
    analysis: result.choices[0].message.content 
  };
}

// 成语解释
async function handleIdiomExplain(idiom) {
  const prompt = `请详细解释成语"${idiom}"：

请按以下格式回答：
【成语释义】
[简洁的成语含义]

【出处典故】
[成语的来源和历史故事]

【原文引用】
[出处原文（如有）]

【用法示例】
[给出2个现代用法例句]

【近义词·反义词】
近义词：[列出]
反义词：[列出]`;

  const result = await cloud.ai.inference.completions({
    model: 'hunyuan-turbos-latest',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt }
    ],
    temperature: 0.5,
    max_tokens: 1500
  });
  
  return { 
    success: true, 
    explanation: result.choices[0].message.content 
  };
}

// 历史知识
async function handleHistory(query) {
  const prompt = `请介绍关于"${query}"的历史知识：

请按以下格式回答：
【历史概述】
[简要介绍]

【重要细节】
[详细历史内容]

【历史影响】
[对后世的影响与意义]

【文化延伸】
[相关文学、艺术作品或典故]`;

  const result = await cloud.ai.inference.completions({
    model: 'hunyuan-turbos-latest',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt }
    ],
    temperature: 0.6,
    max_tokens: 2000
  });
  
  return { 
    success: true, 
    content: result.choices[0].message.content 
  };
}

// 流式对话（用于实时显示）
async function handleStreamChat(messages) {
  const formattedMessages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }))
  ];
  
  // 使用流式API
  const stream = await cloud.ai.inference.completions({
    model: 'hunyuan-turbos-latest',
    messages: formattedMessages,
    temperature: 0.8,
    max_tokens: 2000,
    stream: true
  });

  let fullContent = '';
  for await (const chunk of stream) {
    if (chunk.choices[0]?.delta?.content) {
      fullContent += chunk.choices[0].delta.content;
    }
  }
  
  return { success: true, reply: fullContent };
}
