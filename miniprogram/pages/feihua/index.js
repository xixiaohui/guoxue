// pages/feihua/index.js - 飞花令（单人对诗库：主题字出题 → 赏诗续令）
//
// 玩法：
//   1. 自由飞花：系统出含「主题字」的诗句即可续令，不限位置；
//   2. 行飞花令：第 N 轮要求「主题字」居句中第 N 位（按小句计，标点忽略，
//      七言循环：第 1-7 轮字居 1-7 位，第 8 轮回到第 1 位）。
// 出诗策略：优先 /poems/random?char=X 网络出题（会话内去重）；
//   行令位置不满足时重试，仍无则降级为含字即可并明示；断网/失败时用内置
//   飞花令字库兜底，保证朋友圈单页模式（scene 1154）下也能正常对诗。

const poetry = require('../../utils/poetryApi');
const poemCache = require('../../utils/poemCache');
const settings = require('../../utils/settings');
const seo = require('../../utils/seo');
const landing = require('../../utils/landing');

// ─── 常量 ─────────────────────────────────────────────
// 常用飞花令主题字
const DEFAULT_WORDS = ['花', '月', '风', '雪', '山', '水', '春', '秋', '云', '雨', '夜', '人', '江', '海', '天', '酒', '日', '柳'];

// 行飞花令按七言循环：第 1-7 轮字居句第 1-7 位，第 8 轮回到第 1 位
const POS_CYCLE = 7;
// 每轮出诗：API 最多尝试次数（请求失败即停止，转离线字库）
const MAX_API_ATTEMPTS = 5;

// 离线飞花令字库：断网/API 失败时的兜底，同时承担「行令位置」的最后降级
const FLY_LIB = {
  花: [
    { text: '花间一壶酒，独酌无相亲', author: '李白', title: '月下独酌', dynasty: '唐' },
    { text: '感时花溅泪，恨别鸟惊心', author: '杜甫', title: '春望', dynasty: '唐' },
    { text: '夜来风雨声，花落知多少', author: '孟浩然', title: '春晓', dynasty: '唐' },
    { text: '黄四娘家花满蹊，千朵万朵压枝低', author: '杜甫', title: '江畔独步寻花', dynasty: '唐' },
    { text: '人面桃花相映红', author: '崔护', title: '题都城南庄', dynasty: '唐' },
    { text: '落红不是无情物，化作春泥更护花', author: '龚自珍', title: '己亥杂诗', dynasty: '清' },
    { text: '晓看红湿处，花重锦官城', author: '杜甫', title: '春夜喜雨', dynasty: '唐' },
    { text: '接天莲叶无穷碧，映日荷花别样红', author: '杨万里', title: '晓出净慈寺送林子方', dynasty: '宋' }
  ],
  月: [
    { text: '床前明月光，疑是地上霜', author: '李白', title: '静夜思', dynasty: '唐' },
    { text: '明月几时有，把酒问青天', author: '苏轼', title: '水调歌头', dynasty: '宋' },
    { text: '海上生明月，天涯共此时', author: '张九龄', title: '望月怀远', dynasty: '唐' },
    { text: '举头望明月，低头思故乡', author: '李白', title: '静夜思', dynasty: '唐' },
    { text: '春江潮水连海平，海上明月共潮生', author: '张若虚', title: '春江花月夜', dynasty: '唐' },
    { text: '露似真珠月似弓', author: '白居易', title: '暮江吟', dynasty: '唐' },
    { text: '月落乌啼霜满天', author: '张继', title: '枫桥夜泊', dynasty: '唐' },
    { text: '无言独上西楼，月如钩', author: '李煜', title: '相见欢', dynasty: '五代' }
  ],
  风: [
    { text: '春风又绿江南岸，明月何时照我还', author: '王安石', title: '泊船瓜洲', dynasty: '宋' },
    { text: '随风潜入夜，润物细无声', author: '杜甫', title: '春夜喜雨', dynasty: '唐' },
    { text: '夜来风雨声，花落知多少', author: '孟浩然', title: '春晓', dynasty: '唐' },
    { text: '大风起兮云飞扬', author: '刘邦', title: '大风歌', dynasty: '汉' },
    { text: '不知细叶谁裁出，二月春风似剪刀', author: '贺知章', title: '咏柳', dynasty: '唐' },
    { text: '东风不与周郎便，铜雀春深锁二乔', author: '杜牧', title: '赤壁', dynasty: '唐' },
    { text: '忽如一夜春风来，千树万树梨花开', author: '岑参', title: '白雪歌送武判官归京', dynasty: '唐' },
    { text: '料峭春风吹酒醒，微冷，山头斜照却相迎', author: '苏轼', title: '定风波', dynasty: '宋' }
  ],
  雪: [
    { text: '窗含西岭千秋雪，门泊东吴万里船', author: '杜甫', title: '绝句', dynasty: '唐' },
    { text: '欲将轻骑逐，大雪满弓刀', author: '卢纶', title: '塞下曲', dynasty: '唐' },
    { text: '孤舟蓑笠翁，独钓寒江雪', author: '柳宗元', title: '江雪', dynasty: '唐' },
    { text: '遥知不是雪，为有暗香来', author: '王安石', title: '梅花', dynasty: '宋' },
    { text: '柴门闻犬吠，风雪夜归人', author: '刘长卿', title: '逢雪宿芙蓉山主人', dynasty: '唐' },
    { text: '北风卷地白草折，胡天八月即飞雪', author: '岑参', title: '白雪歌送武判官归京', dynasty: '唐' },
    { text: '欲渡黄河冰塞川，将登太行雪满山', author: '李白', title: '行路难', dynasty: '唐' }
  ],
  山: [
    { text: '千山鸟飞绝，万径人踪灭', author: '柳宗元', title: '江雪', dynasty: '唐' },
    { text: '空山新雨后，天气晚来秋', author: '王维', title: '山居秋暝', dynasty: '唐' },
    { text: '白日依山尽，黄河入海流', author: '王之涣', title: '登鹳雀楼', dynasty: '唐' },
    { text: '山重水复疑无路，柳暗花明又一村', author: '陆游', title: '游山西村', dynasty: '宋' },
    { text: '两岸青山相对出，孤帆一片日边来', author: '李白', title: '望天门山', dynasty: '唐' },
    { text: '会当凌绝顶，一览众山小', author: '杜甫', title: '望岳', dynasty: '唐' },
    { text: '采菊东篱下，悠然见南山', author: '陶渊明', title: '饮酒', dynasty: '东晋' }
  ],
  水: [
    { text: '桃花潭水深千尺，不及汪伦送我情', author: '李白', title: '赠汪伦', dynasty: '唐' },
    { text: '水光潋滟晴方好，山色空蒙雨亦奇', author: '苏轼', title: '饮湖上初晴后雨', dynasty: '宋' },
    { text: '问君能有几多愁？恰似一江春水向东流', author: '李煜', title: '虞美人', dynasty: '五代' },
    { text: '抽刀断水水更流，举杯消愁愁更愁', author: '李白', title: '宣州谢朓楼饯别校书叔云', dynasty: '唐' },
    { text: '竹外桃花三两枝，春江水暖鸭先知', author: '苏轼', title: '惠崇春江晚景', dynasty: '宋' },
    { text: '孤山寺北贾亭西，水面初平云脚低', author: '白居易', title: '钱塘湖春行', dynasty: '唐' },
    { text: '落霞与孤鹜齐飞，秋水共长天一色', author: '王勃', title: '滕王阁序', dynasty: '唐' }
  ],
  春: [
    { text: '春眠不觉晓，处处闻啼鸟', author: '孟浩然', title: '春晓', dynasty: '唐' },
    { text: '春色满园关不住，一枝红杏出墙来', author: '叶绍翁', title: '游园不值', dynasty: '宋' },
    { text: '春风又绿江南岸，明月何时照我还', author: '王安石', title: '泊船瓜洲', dynasty: '宋' },
    { text: '竹外桃花三两枝，春江水暖鸭先知', author: '苏轼', title: '惠崇春江晚景', dynasty: '宋' },
    { text: '野火烧不尽，春风吹又生', author: '白居易', title: '赋得古原草送别', dynasty: '唐' },
    { text: '春蚕到死丝方尽，蜡炬成灰泪始干', author: '李商隐', title: '无题', dynasty: '唐' },
    { text: '等闲识得东风面，万紫千红总是春', author: '朱熹', title: '春日', dynasty: '宋' }
  ],
  秋: [
    { text: '空山新雨后，天气晚来秋', author: '王维', title: '山居秋暝', dynasty: '唐' },
    { text: '春花秋月何时了？往事知多少', author: '李煜', title: '虞美人', dynasty: '五代' },
    { text: '自古逢秋悲寂寥，我言秋日胜春朝', author: '刘禹锡', title: '秋词', dynasty: '唐' },
    { text: '万里悲秋常作客，百年多病独登台', author: '杜甫', title: '登高', dynasty: '唐' },
    { text: '湖光秋月两相和，潭面无风镜未磨', author: '刘禹锡', title: '望洞庭', dynasty: '唐' },
    { text: '解落三秋叶，能开二月花', author: '李峤', title: '风', dynasty: '唐' },
    { text: '秋风萧瑟天气凉，草木摇落露为霜', author: '曹丕', title: '燕歌行', dynasty: '三国' }
  ],
  云: [
    { text: '只在此山中，云深不知处', author: '贾岛', title: '寻隐者不遇', dynasty: '唐' },
    { text: '黄河远上白云间，一片孤城万仞山', author: '王之涣', title: '凉州词', dynasty: '唐' },
    { text: '众鸟高飞尽，孤云独去闲', author: '李白', title: '独坐敬亭山', dynasty: '唐' },
    { text: '朝辞白帝彩云间，千里江陵一日还', author: '李白', title: '早发白帝城', dynasty: '唐' },
    { text: '黑云压城城欲摧，甲光向日金鳞开', author: '李贺', title: '雁门太守行', dynasty: '唐' },
    { text: '行到水穷处，坐看云起时', author: '王维', title: '终南别业', dynasty: '唐' },
    { text: '半亩方塘一鉴开，天光云影共徘徊', author: '朱熹', title: '观书有感', dynasty: '宋' },
    { text: '大风起兮云飞扬', author: '刘邦', title: '大风歌', dynasty: '汉' }
  ],
  雨: [
    { text: '好雨知时节，当春乃发生', author: '杜甫', title: '春夜喜雨', dynasty: '唐' },
    { text: '清明时节雨纷纷，路上行人欲断魂', author: '杜牧', title: '清明', dynasty: '唐' },
    { text: '夜来风雨声，花落知多少', author: '孟浩然', title: '春晓', dynasty: '唐' },
    { text: '渭城朝雨浥轻尘，客舍青青柳色新', author: '王维', title: '送元二使安西', dynasty: '唐' },
    { text: '水光潋滟晴方好，山色空蒙雨亦奇', author: '苏轼', title: '饮湖上初晴后雨', dynasty: '宋' },
    { text: '天街小雨润如酥，草色遥看近却无', author: '韩愈', title: '早春呈水部张十八员外', dynasty: '唐' },
    { text: '昨夜雨疏风骤，浓睡不消残酒', author: '李清照', title: '如梦令', dynasty: '宋' },
    { text: '青箬笠，绿蓑衣，斜风细雨不须归', author: '张志和', title: '渔歌子', dynasty: '唐' }
  ],
  夜: [
    { text: '夜来风雨声，花落知多少', author: '孟浩然', title: '春晓', dynasty: '唐' },
    { text: '随风潜入夜，润物细无声', author: '杜甫', title: '春夜喜雨', dynasty: '唐' },
    { text: '昨夜星辰昨夜风，画楼西畔桂堂东', author: '李商隐', title: '无题', dynasty: '唐' },
    { text: '二十四桥明月夜，玉人何处教吹箫', author: '杜牧', title: '寄扬州韩绰判官', dynasty: '唐' },
    { text: '东风夜放花千树，更吹落、星如雨', author: '辛弃疾', title: '青玉案·元夕', dynasty: '宋' },
    { text: '姑苏城外寒山寺，夜半钟声到客船', author: '张继', title: '枫桥夜泊', dynasty: '唐' },
    { text: '寒雨连江夜入吴，平明送客楚山孤', author: '王昌龄', title: '芙蓉楼送辛渐', dynasty: '唐' },
    { text: '今夜月明人尽望，不知秋思落谁家', author: '王建', title: '十五夜望月', dynasty: '唐' }
  ],
  人: [
    { text: '人生自古谁无死，留取丹心照汗青', author: '文天祥', title: '过零丁洋', dynasty: '宋' },
    { text: '人间四月芳菲尽，山寺桃花始盛开', author: '白居易', title: '大林寺桃花', dynasty: '唐' },
    { text: '空山不见人，但闻人语响', author: '王维', title: '鹿柴', dynasty: '唐' },
    { text: '但愿人长久，千里共婵娟', author: '苏轼', title: '水调歌头', dynasty: '宋' },
    { text: '莫愁前路无知己，天下谁人不识君', author: '高适', title: '别董大', dynasty: '唐' },
    { text: '清明时节雨纷纷，路上行人欲断魂', author: '杜牧', title: '清明', dynasty: '唐' },
    { text: '深林人不知，明月来相照', author: '王维', title: '竹里馆', dynasty: '唐' }
  ],
  江: [
    { text: '春风又绿江南岸，明月何时照我还', author: '王安石', title: '泊船瓜洲', dynasty: '宋' },
    { text: '孤帆远影碧空尽，唯见长江天际流', author: '李白', title: '黄鹤楼送孟浩然之广陵', dynasty: '唐' },
    { text: '问君能有几多愁？恰似一江春水向东流', author: '李煜', title: '虞美人', dynasty: '五代' },
    { text: '江天一色无纤尘，皎皎空中孤月轮', author: '张若虚', title: '春江花月夜', dynasty: '唐' },
    { text: '日出江花红胜火，春来江水绿如蓝', author: '白居易', title: '忆江南', dynasty: '唐' },
    { text: '大江东去，浪淘尽，千古风流人物', author: '苏轼', title: '念奴娇·赤壁怀古', dynasty: '宋' },
    { text: '竹外桃花三两枝，春江水暖鸭先知', author: '苏轼', title: '惠崇春江晚景', dynasty: '宋' },
    { text: '日暮乡关何处是？烟波江上使人愁', author: '崔颢', title: '黄鹤楼', dynasty: '唐' }
  ],
  海: [
    { text: '海内存知己，天涯若比邻', author: '王勃', title: '送杜少府之任蜀州', dynasty: '唐' },
    { text: '海上生明月，天涯共此时', author: '张九龄', title: '望月怀远', dynasty: '唐' },
    { text: '百川东到海，何时复西归', author: '汉乐府', title: '长歌行', dynasty: '汉' },
    { text: '曾经沧海难为水，除却巫山不是云', author: '元稹', title: '离思', dynasty: '唐' },
    { text: '长风破浪会有时，直挂云帆济沧海', author: '李白', title: '行路难', dynasty: '唐' },
    { text: '白日依山尽，黄河入海流', author: '王之涣', title: '登鹳雀楼', dynasty: '唐' },
    { text: '海日生残夜，江春入旧年', author: '王湾', title: '次北固山下', dynasty: '唐' }
  ],
  天: [
    { text: '天街小雨润如酥，草色遥看近却无', author: '韩愈', title: '早春呈水部张十八员外', dynasty: '唐' },
    { text: '海内存知己，天涯若比邻', author: '王勃', title: '送杜少府之任蜀州', dynasty: '唐' },
    { text: '飞流直下三千尺，疑是银河落九天', author: '李白', title: '望庐山瀑布', dynasty: '唐' },
    { text: '野旷天低树，江清月近人', author: '孟浩然', title: '宿建德江', dynasty: '唐' },
    { text: '黄河之水天上来，奔流到海不复回', author: '李白', title: '将进酒', dynasty: '唐' },
    { text: '天生我材必有用，千金散尽还复来', author: '李白', title: '将进酒', dynasty: '唐' },
    { text: '天苍苍，野茫茫，风吹草低见牛羊', author: '佚名', title: '敕勒歌', dynasty: '北朝' }
  ],
  酒: [
    { text: '葡萄美酒夜光杯，欲饮琵琶马上催', author: '王翰', title: '凉州词', dynasty: '唐' },
    { text: '花间一壶酒，独酌无相亲', author: '李白', title: '月下独酌', dynasty: '唐' },
    { text: '明月几时有，把酒问青天', author: '苏轼', title: '水调歌头', dynasty: '宋' },
    { text: '劝君更尽一杯酒，西出阳关无故人', author: '王维', title: '送元二使安西', dynasty: '唐' },
    { text: '白日放歌须纵酒，青春作伴好还乡', author: '杜甫', title: '闻官军收河南河北', dynasty: '唐' },
    { text: '借问酒家何处有，牧童遥指杏花村', author: '杜牧', title: '清明', dynasty: '唐' },
    { text: '绿蚁新醅酒，红泥小火炉', author: '白居易', title: '问刘十九', dynasty: '唐' },
    { text: '今朝有酒今朝醉，明日愁来明日愁', author: '罗隐', title: '自遣', dynasty: '唐' }
  ],
  日: [
    { text: '日出江花红胜火，春来江水绿如蓝', author: '白居易', title: '忆江南', dynasty: '唐' },
    { text: '白日依山尽，黄河入海流', author: '王之涣', title: '登鹳雀楼', dynasty: '唐' },
    { text: '日照香炉生紫烟，遥看瀑布挂前川', author: '李白', title: '望庐山瀑布', dynasty: '唐' },
    { text: '朝辞白帝彩云间，千里江陵一日还', author: '李白', title: '早发白帝城', dynasty: '唐' },
    { text: '东边日出西边雨，道是无晴却有晴', author: '刘禹锡', title: '竹枝词', dynasty: '唐' },
    { text: '锄禾日当午，汗滴禾下土', author: '李绅', title: '悯农', dynasty: '唐' },
    { text: '接天莲叶无穷碧，映日荷花别样红', author: '杨万里', title: '晓出净慈寺送林子方', dynasty: '宋' },
    { text: '大漠孤烟直，长河落日圆', author: '王维', title: '使至塞上', dynasty: '唐' }
  ],
  柳: [
    { text: '山重水复疑无路，柳暗花明又一村', author: '陆游', title: '游山西村', dynasty: '宋' },
    { text: '渭城朝雨浥轻尘，客舍青青柳色新', author: '王维', title: '送元二使安西', dynasty: '唐' },
    { text: '两个黄鹂鸣翠柳，一行白鹭上青天', author: '杜甫', title: '绝句', dynasty: '唐' },
    { text: '羌笛何须怨杨柳，春风不度玉门关', author: '王之涣', title: '凉州词', dynasty: '唐' },
    { text: '月上柳梢头，人约黄昏后', author: '欧阳修', title: '生查子·元夕', dynasty: '宋' },
    { text: '杨柳青青江水平，闻郎江上踏歌声', author: '刘禹锡', title: '竹枝词', dynasty: '唐' },
    { text: '昔我往矣，杨柳依依', author: '佚名', title: '诗经·采薇', dynasty: '先秦' },
    { text: '沾衣欲湿杏花雨，吹面不寒杨柳风', author: '志南', title: '绝句', dynasty: '宋' }
  ]
};

// ─── 工具函数 ─────────────────────────────────────────
/** 按标点/换行切分为独立小句（如「床前明月光」「疑是地上霜」） */
function splitPhrases(content) {
  return String(content || '')
    .split(/[，。！？；：、,.!?;:·…—–~～“”‘’「」『』（）()《》〈〉\[\]【】\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 主题字是否处于某小句的第 pos 位（pos 从 1 起；同句多次出现，任一位置满足即可） */
function matchPos(content, word, pos) {
  return splitPhrases(content).some((ph) => {
    let idx = ph.indexOf(word);
    while (idx !== -1) {
      if (idx + 1 === pos) return true;
      idx = ph.indexOf(word, idx + 1);
    }
    return false;
  });
}

/** 内容中最长小句的字数（用于判断「字数不足无法合位」） */
function maxPhraseLen(content) {
  let max = 0;
  splitPhrases(content).forEach((ph) => {
    if (ph.length > max) max = ph.length;
  });
  return max;
}

Page({
  data: {
    isSinglePage: false,

    // 阶段：pick 选字 | play 对局 | result 结算
    stage: 'pick',
    words: DEFAULT_WORDS,
    word: '',
    customWord: '',
    mode: 'free',          // free 自由飞花 | strict 行飞花令
    modeName: '自由飞花',
    modeNames: { free: '自由飞花', strict: '行飞花令' },
    ruleOpen: false,

    // 对局
    round: 0,              // 已完成轮数
    targetPos: 1,          // 本轮要求位置（行令）
    totalShown: 0,         // 已赏诗句数
    loading: false,
    poem: null,            // { id, title, author, dynasty, content, chars:[{ch,hit}] }
    relaxed: false,        // 本轮是否已放宽为含字即可
    relaxReason: '',       // 放宽原因：short 字数不足 | nomatch 无合位名句
    relaxMaxLen: 0,        // 放宽时本句最长小句字数（short 原因展示用）
    error: '',

    // 结算
    result: { word: '', rounds: 0, shown: 0, comment: '' }
  },

  onLoad(options) {
    this._seenIds = new Set();
    this.setData({ isSinglePage: landing.isSinglePage() });

    // 分享落地：URL 带 word → 直接开局（朋友圈单页模式 scene 1154 也走这里）
    const word = landing.safeDecode((options && options.word) || '');
    const m = String(word || '').trim().match(/[\u4e00-\u9fa5]/);
    if (m) {
      this.setData({ word: m[0], stage: 'play' });
      this.nextRound();
    }

    landing.setNavTitle('飞花令');
    this._setupSeo();
  },

  onShow() {
    settings.applyToPage(this);
  },

  /** 搜一搜优化：飞花令页上报关键词 */
  _setupSeo() {
    seo.reportPageInfo({
      title: '飞花令 · 以诗会友',
      navTitle: '飞花令',
      keywords: seo.buildKeywords([
        '飞花令', '诗词游戏', '以诗会友', '行飞花令', '古诗词', '诗词接龙',
        '唐诗', '宋词', '花月风', '国学游戏', '国文之学', '诗词'
      ]),
      description: '飞花令——主题字出题，以诗会友。自由飞花与行飞花令两种玩法，品读含「花月风雪」等主题字的千古名句。'
    });
  },

  // ── 选字阶段 ──────────────────────────────
  pickWord(e) {
    this.setData({ word: e.currentTarget.dataset.word, customWord: '' });
  },

  onCustomInput(e) {
    this.setData({ customWord: e.detail.value });
  },

  switchMode(e) {
    const mode = e.currentTarget.dataset.mode;
    if (mode === this.data.mode) return;
    this.setData({ mode, modeName: this.data.modeNames[mode] || '' });
  },

  toggleRule() {
    this.setData({ ruleOpen: !this.data.ruleOpen });
  },

  /** 开局：校验主题字（预设或自定义输入的第一个汉字）后进入对局 */
  startGame() {
    let word = this.data.word;
    const input = String(this.data.customWord || '').trim();
    if (input) {
      const m = input.match(/[\u4e00-\u9fa5]/);
      if (!m) {
        wx.showToast({ title: '请输入一个汉字', icon: 'none' });
        return;
      }
      word = m[0];
    }
    if (!word) {
      wx.showToast({ title: '请选择或输入主题字', icon: 'none' });
      return;
    }
    this._seenIds = new Set();
    this.setData({
      word,
      stage: 'play',
      round: 0,
      totalShown: 0,
      poem: null,
      error: '',
      relaxed: false,
      relaxReason: '',
      relaxMaxLen: 0,
      loading: false
    });
    this.nextRound();
  },

  // ── 对局阶段 ──────────────────────────────
  nextRound() {
    if (this.data.loading) return;
    const round = this.data.round + 1;
    const targetPos = ((round - 1) % POS_CYCLE) + 1;
    this.setData({
      loading: true,
      error: '',
      relaxed: false,
      relaxReason: '',
      relaxMaxLen: 0,
      poem: null,
      round,
      targetPos
    });
    this._fetchForRound(targetPos);
  },

  /** 出诗：API 优先（去重+位置校验），失败/不满足则用离线字库兜底 */
  async _fetchForRound(targetPos) {
    const word = this.data.word;
    const strict = this.data.mode === 'strict';
    const seen = this._seenIds || new Set();

    let poem = null;
    let relaxed = false;
    let fallback = null; // 首个含字但不合位的 API 句，作为放宽保底

    // 1) 网络出题 /poems/random?char=word
    for (let i = 0; i < MAX_API_ATTEMPTS; i++) {
      let p = null;
      try {
        p = await poetry.getRandomPoem({ char: word });
      } catch (_) { break; } // 零匹配/断网：不再连续请求，转离线字库
      if (!p || !p.content || p.content.indexOf(word) < 0) continue;
      if (seen.has(String(p.id))) continue;
      if (!strict || matchPos(p.content, word, targetPos)) { poem = p; break; }
      if (!fallback) fallback = p; // 记住首个含字句：位置不满足时作为放宽保底
    }
    // 行令多次尝试均无合位 → 直接采用保底句放宽为含字即可，不再重复请求离线库
    if (strict && !poem && fallback) {
      poem = fallback;
      relaxed = true;
    }

    // 2) 离线字库兜底
    if (!poem) {
      const lib = FLY_LIB[word] || [];
      if (strict) {
        const hit = lib.find((it) => matchPos(it.text, word, targetPos));
        if (hit) {
          poem = this._libToPoem(hit);
        } else if (lib.length) {
          // 离线库无合位句 → 放宽为含字即可
          poem = this._libToPoem(lib[Math.floor(Math.random() * lib.length)]);
          relaxed = true;
        }
      } else if (lib.length) {
        poem = this._libToPoem(lib[Math.floor(Math.random() * lib.length)]);
      }
    }

    if (!poem) {
      this.setData({
        loading: false,
        error: '暂未寻得含「' + word + '」的诗句，换个主题字再战'
      });
      return;
    }

    seen.add(String(poem.id));
    this._seenIds = seen;

    // 放宽原因分层：本句最长小句不足目标位 → short；否则 → nomatch
    let relaxReason = '';
    let relaxMaxLen = 0;
    if (relaxed) {
      relaxMaxLen = maxPhraseLen(poem.content);
      relaxReason = relaxMaxLen < targetPos ? 'short' : 'nomatch';
    }

    this.setData({
      loading: false,
      relaxed,
      relaxReason,
      relaxMaxLen,
      poem: this._buildPoemView(poem, word),
      totalShown: this.data.totalShown + 1
    });
  },

  /** 构建渲染视图：正文按字拆分，主题字高亮 */
  _buildPoemView(poem, word) {
    const content = poem.content || '';
    const chars = Array.from(content).map((ch) => ({ ch, hit: ch === word }));
    return {
      id: poem.id,
      title: poem.title || '',
      author: poem.author || '',
      dynasty: poem.dynasty || '',
      content,
      chars
    };
  },

  /** 离线字库条目 → 诗词对象（合成稳定 id，同字同句不重复展示） */
  _libToPoem(it) {
    return {
      id: 'feihua-' + (it.author || '佚') + '-' + (it.title || it.text.slice(0, 4)),
      title: it.title || '',
      content: it.text || '',
      author: it.author || '',
      dynasty: it.dynasty || '',
      type: ''
    };
  },

  /** 查看全诗 → 详情页（单页模式禁跳转） */
  viewFullPoem() {
    if (this.data.isSinglePage) {
      wx.showToast({ title: '请打开小程序体验此功能', icon: 'none' });
      return;
    }
    const poem = this.data.poem;
    if (!poem) return;
    const full = {
      id: poem.id,
      title: poem.title,
      content: poem.content,
      author: poem.author,
      dynasty: poem.dynasty,
      type: poem.type || ''
    };
    poemCache.cachePoem(full);
    wx.navigateTo({ url: this._buildPoemUrl(full) });
  },

  /** 组装诗词详情 URL（与列表页一致：超长时截断 content） */
  _buildPoemUrl(poem) {
    const qs = [
      'kind=poem',
      'id=' + encodeURIComponent(poem.id == null ? '' : String(poem.id)),
      'title=' + encodeURIComponent(poem.title || ''),
      'author=' + encodeURIComponent(poem.author || ''),
      'dynasty=' + encodeURIComponent(poem.dynasty || ''),
      'type=' + encodeURIComponent(poem.type || '')
    ];
    let content = poem.content || poem.preview || '';
    let url = '';
    for (let i = 0; i < 3; i++) {
      url = '/pages/chinesepoetry_detail/index?' + qs.join('&') + '&content=' + encodeURIComponent(content);
      if (url.length <= 1800) break;
      content = content.slice(0, Math.floor(content.length * 0.7));
    }
    return url;
  },

  // ── 结算 ──────────────────────────────────
  endGame() {
    this.setData({
      stage: 'result',
      result: {
        word: this.data.word,
        rounds: this.data.round,
        shown: this.data.totalShown,
        comment: this._commentFor(this.data.round)
      }
    });
  },

  /** 再来一局：同字重新开局 */
  restart() {
    this._seenIds = new Set();
    this.setData({
      stage: 'play',
      round: 0,
      totalShown: 0,
      poem: null,
      error: '',
      relaxed: false,
      relaxReason: '',
      relaxMaxLen: 0,
      loading: false
    });
    this.nextRound();
  },

  /** 换个字：回到选字 */
  changeWord() {
    this._seenIds = new Set();
    this.setData({
      stage: 'pick',
      round: 0,
      totalShown: 0,
      poem: null,
      error: '',
      relaxed: false,
      relaxReason: '',
      relaxMaxLen: 0,
      loading: false
    });
  },

  _commentFor(rounds) {
    if (rounds >= 30) return '一令惊鸿';
    if (rounds >= 20) return '飞花圣手';
    if (rounds >= 12) return '飞花高手';
    if (rounds >= 7) return '渐入佳境';
    if (rounds >= 3) return '初窥门径';
    return '再接再厉';
  },

  // ── 分享 ──────────────────────────────────
  onShareAppMessage() {
    const word = this.data.word;
    return {
      title: word
        ? '飞花令 · 「' + word + '」字出题，来对诗！'
        : '飞花令 · 以诗会友，快来挑战',
      path: word
        ? '/pages/feihua/index?word=' + encodeURIComponent(word)
        : '/pages/feihua/index'
    };
  },

  onShareTimeline() {
    const word = this.data.word;
    return {
      title: word
        ? '飞花令 · 「' + word + '」字挑战，你能接几轮？'
        : '飞花令 · 以诗会友，快来挑战',
      query: word ? 'word=' + encodeURIComponent(word) : 'from=timeline'
    };
  }
});
