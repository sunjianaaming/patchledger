// 错题伙伴 · 真机原型：拍照/录音为真实调用，AI 对话为写死剧本（贯穿题 3/4 + 1/6）
const recorder = wx.getRecorderManager();

const D_SCRIPT = [
  { mic: '🎙️ 点一下，说给嘟嘟听', me: '就是把四分之三和六分之一加在一起。',
    ai: '听懂啦！那你现在再做一遍，答案是多少？', micNext: '🎙️ 语音报答案' },
  { mic: '🎙️ 语音报答案', me: '嗯……十分之四？',
    ai: '和上次写的一样呀，别急 😊 嘟嘟问你个小问题：3/4 和 1/6 的分母不一样，能直接把分子、分母各自加起来吗？',
    micNext: '🎙️ 想一想，再回答' },
  { mic: '🎙️ 想一想，再回答', me: '……不能？好像要先把分母变成一样的。',
    ai: '对啦！这一步叫「通分」。看：3/4 = 9/12，1/6 = 2/12，加起来就是 11/12 🎯 现在你再说一遍答案？',
    micNext: '🎙️ 再答一次' },
  { mic: '🎙️ 再答一次', me: '十二分之十一！',
    ai: '答对啦 ✨ 你把「先通分」补上了，进步！' },
];

const F_SCRIPT = [
  { mic: '🎙️ 开始讲课', me: '因为分母不一样，就像一个切 5 块、一个切 3 块的蛋糕，没法直接加，要切成一样大的小块。',
    ai: '哦～切成一样大的！那 15 是怎么找出来的呀？为什么不是 8？', micNext: '🎙️ 继续讲' },
  { mic: '🎙️ 继续讲', me: '因为 15 是 5 和 3 的最小公倍数，5 和 3 都能变成 15。',
    ai: '嘟嘟听懂啦！🎉 你今天把「为什么要通分」和「公分母怎么找」都讲清楚了，蛋糕的比方特别棒，比上次进步！' },
];

Page({
  data: {
    screen: 'home',
    st1: false, st2: false, streak: 3,
    // 拍题：shoot → crop → ocr
    capStep: 'shoot', photo: '',
    ocrText: '计算：3/4 + 1/6 = ______',
    // 诊断对话
    dMsgs: [{ who: 'ai', text: '收好啦！先别急着算——用你自己的话告诉嘟嘟，这道题让你干嘛呀？' }],
    dStep: 0, dDone: false,
    // 费曼对话
    fMsgs: [{ who: 'ai', text: '嘟嘟还是有点晕 😵 你当老师，教教我：为什么 2/5 + 1/3 要先把分母都变成 15 呀？' }],
    fStep: 0, fDone: false,
    micState: 'idle', micLabel: D_SCRIPT[0].mic,
    // 归因
    causes: ['粗心', '读题没读懂', '概念不清 · 通分', '不会'], cause: 2,
    // 类似题 / 复习题
    pOpts: ['3/8', '11/15', '3/15', '2/8'], pPicked: -1, pResult: '',
    rOpts: ['0.23', '0.95', '1.05', '0.85'], rPicked: -1, rResult: '',
  },

  onLoad() {
    recorder.onStop(() => this.afterRecord());
    // 录音失败（如未授权）也推进剧本，原型绝不卡死
    recorder.onError(() => this.afterRecord());
  },

  go(e) {
    const s = e.currentTarget.dataset.s;
    const patch = { screen: s, micState: 'idle' };
    if (s === 'diagnose' && this.data.dStep < D_SCRIPT.length) patch.micLabel = D_SCRIPT[this.data.dStep].mic;
    if (s === 'feynman' && this.data.fStep < F_SCRIPT.length) patch.micLabel = F_SCRIPT[this.data.fStep].mic;
    this.setData(patch);
    wx.pageScrollTo({ scrollTop: 0, duration: 0 });
  },

  /* ---------- 拍照录题 ---------- */
  shoot() {
    wx.chooseMedia({
      count: 1, mediaType: ['image'], sourceType: ['camera', 'album'],
      success: (res) => this.setData({ photo: res.tempFiles[0].tempFilePath, capStep: 'crop' }),
    });
  },
  skipShoot() { this.setData({ photo: '', capStep: 'ocr' }); },
  reshoot() { this.setData({ photo: '', capStep: 'shoot' }); },
  cropOk() { this.setData({ capStep: 'ocr' }); },
  ocrInput(e) { this.setData({ ocrText: e.detail.value }); },
  voiceAdd() {
    wx.showModal({ title: '语音补充', content: '原型占位：开发版在这里把语音转成文字补进题干。', showCancel: false });
  },

  /* ---------- 录音（诊断 / 费曼共用，真实调用麦克风）---------- */
  micTap() {
    if (this.data.micState === 'idle') {
      recorder.start({ duration: 60000, format: 'aac' });
      this.setData({ micState: 'rec' });
    } else if (this.data.micState === 'rec') {
      this.setData({ micState: 'busy' });
      recorder.stop();
    }
  },
  afterRecord() {
    setTimeout(() => {
      const onD = this.data.screen === 'diagnose';
      const script = onD ? D_SCRIPT : F_SCRIPT;
      const stepKey = onD ? 'dStep' : 'fStep';
      const msgKey = onD ? 'dMsgs' : 'fMsgs';
      const step = this.data[stepKey];
      if (step >= script.length) return;
      const msgs = this.data[msgKey].concat(
        { who: 'me', text: script[step].me },
        { who: 'ai', text: script[step].ai },
      );
      const next = step + 1;
      const done = next >= script.length;
      this.setData({
        [msgKey]: msgs,
        [stepKey]: next,
        micState: 'idle',
        micLabel: done ? '' : script[step].micNext,
        [onD ? 'dDone' : 'fDone']: done,
      });
      wx.pageScrollTo({ scrollTop: 99999, duration: 300 });
    }, 800);
  },

  /* ---------- 归因 / 答题 ---------- */
  pickCause(e) { this.setData({ cause: Number(e.currentTarget.dataset.i) }); },
  pickP(e) {
    const i = Number(e.currentTarget.dataset.i);
    this.setData({ pPicked: i, pResult: i === 1 ? 'right' : 'wrong', st1: i === 1 || this.data.st1 });
  },
  pickR(e) {
    const i = Number(e.currentTarget.dataset.i);
    this.setData({ rPicked: i, rResult: i === 1 ? 'right' : 'wrong' });
  },
  appeal() {
    wx.showModal({ title: '我觉得我对了 🙋', content: '原型占位：孩子重述思路，AI 二次判定——宁可放过，不可错杀。', showCancel: false });
  },
  noMistake() {
    wx.showModal({ title: '今天没有错题？', content: '原型占位：走「学习感悟」路径（第二批原型）。', showCancel: false });
  },
  finish() {
    this.setData({ st1: true, st2: true, streak: 4, screen: 'done' });
    wx.pageScrollTo({ scrollTop: 0, duration: 0 });
  },
});
