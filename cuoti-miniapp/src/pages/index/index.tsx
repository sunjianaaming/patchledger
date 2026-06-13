import { useEffect, useRef, useState } from 'react'
import { View, Text, Image, Textarea } from '@tarojs/components'
import Taro from '@tarojs/taro'
import './index.scss'

// 错题伙伴 · 真机原型（Taro + React + TS）
// 拍照 / 录音为真实硬件调用；AI 对话为写死剧本（贯穿题 3/4 + 1/6）。

type Msg = { who: 'ai' | 'me'; text: string }
type Step = { mic: string; me: string; ai: string; micNext?: string }

const D_SCRIPT: Step[] = [
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
]

const F_SCRIPT: Step[] = [
  { mic: '🎙️ 开始讲课', me: '因为分母不一样，就像一个切 5 块、一个切 3 块的蛋糕，没法直接加，要切成一样大的小块。',
    ai: '哦～切成一样大的！那 15 是怎么找出来的呀？为什么不是 8？', micNext: '🎙️ 继续讲' },
  { mic: '🎙️ 继续讲', me: '因为 15 是 5 和 3 的最小公倍数，5 和 3 都能变成 15。',
    ai: '嘟嘟听懂啦！🎉 你今天把「为什么要通分」和「公分母怎么找」都讲清楚了，蛋糕的比方特别棒，比上次进步！' },
]

const CAUSES = ['粗心', '读题没读懂', '概念不清 · 通分', '不会']

// 分数显示
function Frac({ n, d }: { n: string; d: string }) {
  return <View className='frac'><View className='fn'>{n}</View><View className='fd'>{d}</View></View>
}

// 录音按钮三态
function Mic({ state, label, onTap }: { state: string; label: string; onTap: () => void }) {
  const cls = 'mic ' + (state === 'rec' ? 'mic-rec' : state === 'busy' ? 'mic-busy' : '')
  const text = state === 'idle' ? label : state === 'rec' ? '🔴 录音中… 说完再点一下' : '✨ 嘟嘟正在听懂…'
  return <View className={cls} onClick={onTap}>{text}</View>
}

export default function Index() {
  const [screen, setScreen] = useState('home')
  const [st1, setSt1] = useState(false)
  const [st2, setSt2] = useState(false)
  const [streak, setStreak] = useState(3)

  // 拍题：shoot → crop → ocr
  const [capStep, setCapStep] = useState('shoot')
  const [photo, setPhoto] = useState('')
  const [ocrText, setOcrText] = useState('计算：3/4 + 1/6 = ______')

  // 对话
  const [dMsgs, setDMsgs] = useState<Msg[]>([
    { who: 'ai', text: '收好啦！先别急着算——用你自己的话告诉嘟嘟，这道题让你干嘛呀？' },
  ])
  const [dStep, setDStep] = useState(0)
  const [dDone, setDDone] = useState(false)
  const [fMsgs, setFMsgs] = useState<Msg[]>([
    { who: 'ai', text: '嘟嘟还是有点晕 😵 你当老师，教教我：为什么 2/5 + 1/3 要先把分母都变成 15 呀？' },
  ])
  const [fStep, setFStep] = useState(0)
  const [fDone, setFDone] = useState(false)

  const [micState, setMicState] = useState('idle')
  const [micLabel, setMicLabel] = useState(D_SCRIPT[0].mic)

  const [cause, setCause] = useState(2)
  const [pPicked, setPPicked] = useState(-1)
  const [pResult, setPResult] = useState('')
  const [rPicked, setRPicked] = useState(-1)
  const [rResult, setRResult] = useState('')

  const recorderRef = useRef<any>(null)
  // 把最新状态塞进 ref，供录音回调读取（回调只注册一次）
  const ctx = useRef({ screen, dStep, fStep, dMsgs, fMsgs })
  ctx.current = { screen, dStep, fStep, dMsgs, fMsgs }

  function afterRecord() {
    setTimeout(() => {
      const onD = ctx.current.screen === 'diagnose'
      const script = onD ? D_SCRIPT : F_SCRIPT
      const step = onD ? ctx.current.dStep : ctx.current.fStep
      if (step >= script.length) return
      const base = onD ? ctx.current.dMsgs : ctx.current.fMsgs
      const next = base.concat(
        { who: 'me', text: script[step].me },
        { who: 'ai', text: script[step].ai },
      )
      const ns = step + 1
      const done = ns >= script.length
      if (onD) { setDMsgs(next); setDStep(ns); setDDone(done) }
      else { setFMsgs(next); setFStep(ns); setFDone(done) }
      setMicState('idle')
      setMicLabel(done ? '' : (script[step].micNext || ''))
      Taro.pageScrollTo({ scrollTop: 99999, duration: 300 })
    }, 800)
  }

  useEffect(() => {
    const rec = Taro.getRecorderManager()
    const finish = () => afterRecord()
    rec.onStop(finish)
    rec.onError(finish) // 录音失败（未授权等）也推进剧本，绝不卡死
    recorderRef.current = rec
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function go(s: string) {
    setScreen(s)
    setMicState('idle')
    if (s === 'diagnose' && ctx.current.dStep < D_SCRIPT.length) setMicLabel(D_SCRIPT[ctx.current.dStep].mic)
    if (s === 'feynman' && ctx.current.fStep < F_SCRIPT.length) setMicLabel(F_SCRIPT[ctx.current.fStep].mic)
    Taro.pageScrollTo({ scrollTop: 0, duration: 0 })
  }

  // 拍照
  function shoot() {
    Taro.chooseMedia({
      count: 1, mediaType: ['image'], sourceType: ['camera', 'album'],
      success: (res) => { setPhoto(res.tempFiles[0].tempFilePath); setCapStep('crop') },
    })
  }
  function voiceAdd() {
    Taro.showModal({ title: '语音补充', content: '原型占位：开发版在这里把语音转成文字补进题干。', showCancel: false })
  }

  // 录音（诊断 / 费曼共用）
  function micTap() {
    const rec = recorderRef.current
    if (micState === 'idle') {
      rec.start({ duration: 60000, format: 'aac' })
      setMicState('rec')
    } else if (micState === 'rec') {
      setMicState('busy')
      rec.stop()
    }
  }

  function pickP(i: number) { setPPicked(i); setPResult(i === 1 ? 'right' : 'wrong'); if (i === 1) setSt1(true) }
  function pickR(i: number) { setRPicked(i); setRResult(i === 1 ? 'right' : 'wrong') }
  function appeal() {
    Taro.showModal({ title: '我觉得我对了 🙋', content: '原型占位：孩子重述思路，AI 二次判定——宁可放过，不可错杀。', showCancel: false })
  }
  function noMistake() {
    Taro.showModal({ title: '今天没有错题？', content: '原型占位：走「学习感悟」路径（第二批原型）。', showCancel: false })
  }
  function finish() { setSt1(true); setSt2(true); setStreak(4); setScreen('done'); Taro.pageScrollTo({ scrollTop: 0, duration: 0 }) }

  const Dots = ({ on }: { on: number }) => (
    <View className='dots'>
      {[0, 1, 2, 3, 4, 5].map(i => <View key={i} className={'dot ' + (i < on ? 'dot-on' : '')} />)}
    </View>
  )

  return (
    <View className='wrap'>

      {/* 1. 首页 */}
      {screen === 'home' && (
        <View>
          <View className='topbar'><View className='h1'>嗨，小宇 🌞</View><Text className='tag'>🔥 连续 {streak} 天</Text></View>
          <View className='card'>
            <View className='title'>今日打卡</View>
            <View className='progress2'>
              <View className='pstep'><Text className='st'>{st1 ? '✅' : '⭕'}</Text><View>第一步</View><View>攻克今天的新错题</View></View>
              <View className='pstep'><Text className='st'>{st2 ? '✅' : '⭕'}</Text><View>第二步</View><View>费曼题 + 复习题</View></View>
            </View>
            <View className='btn btn-big' onClick={() => go('capture')}>📷 拍今天的错题</View>
            <View className='btn btn-ghost' onClick={noMistake}>今天没有错题？</View>
          </View>
          <View className='card'>
            <View className='title'>我的小怪兽</View>
            <View className='monster'><Text className='m-emoji'>👾</Text>
              <View className='m-body'><View className='m-name'>阿通分 · 分数加减法</View>
                <View className='energy'><View className='energy-i' style={{ width: '60%' }} /></View></View>
              <Text className='m-val'>60</Text></View>
            <View className='monster'><Text className='m-emoji'>🦖</Text>
              <View className='m-body'><View className='m-name'>小数点 · 小数加减法 <Text className='tag'>今天到期!</Text></View>
                <View className='energy'><View className='energy-i' style={{ width: '80%' }} /></View></View>
              <Text className='m-val'>80</Text></View>
            <View className='placeholder'>▲ 怪兽形象为 AI 生成图占位</View>
          </View>
        </View>
      )}

      {/* 2. 拍照录题 */}
      {screen === 'capture' && (
        <View>
          <View className='topbar'><View className='back' onClick={() => go('home')}>‹</View><View className='h1'>拍错题</View><Dots on={1} /></View>
          {capStep === 'shoot' && (
            <View className='card'>
              <View className='title'>📷 对准作业本，拍下错的那道题</View>
              <View className='muted mt-s'>可以拍照，也可以从相册选</View>
              <View className='btn btn-big' onClick={shoot}>咔嚓，拍照 / 选图</View>
              <View className='btn btn-ghost' onClick={() => { setPhoto(''); setCapStep('ocr') }}>先用示例题试试 →</View>
            </View>
          )}
          {capStep === 'crop' && (
            <View className='card'>
              <View className='title'>框住要收的那道题</View>
              <View className='muted'>原型说明：开发版在这里自动框题 + 手动微调，现在先整张继续</View>
              {photo ? <Image className='photo-prev' src={photo} mode='widthFix' /> : null}
              <View className='btn' onClick={() => setCapStep('ocr')}>就是这道 ✓</View>
              <View className='btn btn-ghost' onClick={() => { setPhoto(''); setCapStep('shoot') }}>重拍一张</View>
            </View>
          )}
          {capStep === 'ocr' && (
            <View className='card'>
              <View className='title'>我认出来的题目 👀</View>
              <View className='muted'>认错了可以直接改，或者用语音告诉我（原型为预置文本）</View>
              <Textarea className='ocr-edit' value={ocrText} onInput={(e) => setOcrText(e.detail.value)} autoHeight />
              <View className='mt-s'><Text className='tag'>数学</Text><Text className='tag'>分数加减法 · 异分母通分</Text></View>
              <View className='btn' onClick={() => go('diagnose')}>题目对啦，继续 →</View>
              <View className='mic' onClick={voiceAdd}>🎙️ 语音补充</View>
              <View className='note'>兜底：连续两次识别失败 → “这道题有点调皮，换个角度再拍一张试试？”（绝不卡死）</View>
            </View>
          )}
        </View>
      )}

      {/* 3. 错因诊断 */}
      {screen === 'diagnose' && (
        <View>
          <View className='topbar'><View className='back' onClick={() => go('capture')}>‹</View><View className='h1'>和嘟嘟聊聊这道题</View><Dots on={2} /></View>
          <View className='qbox'>计算：<Frac n='3' d='4' /> + <Frac n='1' d='6' /> = ______</View>
          <View className='chat mt-m'>
            {dMsgs.map((m, i) => (
              <View key={i} className={'row ' + (m.who === 'me' ? 'row-me' : '')}>
                <View className='avatar'>{m.who === 'me' ? '🧒' : '🐣'}</View>
                <View className={'bubble ' + (m.who === 'me' ? 'bubble-me' : '')}>{m.text}</View>
              </View>
            ))}
          </View>
          {!dDone && <Mic state={micState} label={micLabel} onTap={micTap} />}
          {dDone && (
            <View className='card mt-m'>
              <View className='title'>嘟嘟的小本本记下了 📒</View>
              <View className='muted'>这道题错的原因（点一下可以改）：</View>
              <View className='cause'>
                {CAUSES.map((c, i) => (
                  <View key={i} className={'chip ' + (cause === i ? 'chip-on' : '')} onClick={() => setCause(i)}>{c}</View>
                ))}
              </View>
              <View className='btn' onClick={() => go('practice')}>去做一道类似题 →</View>
            </View>
          )}
        </View>
      )}

      {/* 4. 同类题测试 */}
      {screen === 'practice' && (
        <View>
          <View className='topbar'><View className='back' onClick={() => go('diagnose')}>‹</View><View className='h1'>换个数字试试</View><Dots on={3} /></View>
          <View className='card'>
            <Text className='tag'>同一个知识点 · 新题</Text>
            <View className='qbox'>计算：<Frac n='2' d='5' /> + <Frac n='1' d='3' /> = ?</View>
            <View className='opts'>
              {['3/8', '11/15', '3/15', '2/8'].map((o, i) => (
                <View key={i} className={'opt ' + (pPicked === i ? (i === 1 ? 'opt-right' : 'opt-wrong') : '')} onClick={() => pickP(i)}>{o}</View>
              ))}
            </View>
            {pResult === 'wrong' && <View className='note'>再想想？这次分母要变成多少呀 🤔（不算错，慢慢来）</View>}
            {pResult === 'right' && (
              <View>
                <View className='note note-good'>✅ 答对啦！你已经会「换数字也不怕」了——第一步完成 🎉 阿通分能量 +30</View>
                <View className='btn' onClick={() => go('feynman')}>第二步：当小老师 →</View>
              </View>
            )}
            <View className='btn btn-ghost btn-sm' onClick={appeal}>我觉得我对了 🙋</View>
            <View className='muted'>作答方式按题型切换：选择题点选 / 口算语音报答案 / 解答题拍照（原型只演示点选）</View>
          </View>
        </View>
      )}

      {/* 5. 费曼讲解 */}
      {screen === 'feynman' && (
        <View>
          <View className='topbar'><View className='back' onClick={() => go('practice')}>‹</View><View className='h1'>小老师时间 🎓</View><Dots on={4} /></View>
          <View className='chat'>
            {fMsgs.map((m, i) => (
              <View key={i} className={'row ' + (m.who === 'me' ? 'row-me' : '')}>
                <View className='avatar'>{m.who === 'me' ? '🧒' : '🐣'}</View>
                <View className={'bubble ' + (m.who === 'me' ? 'bubble-me' : '')}>{m.text}</View>
              </View>
            ))}
          </View>
          {!fDone && <Mic state={micState} label={micLabel} onTap={micTap} />}
          {fDone && (
            <View className='card mt-m'>
              <View className='monster'><Text className='m-emoji'>👾</Text>
                <View className='m-body'><View className='m-name'>阿通分 · 理解度</View>
                  <View className='energy'><View className='energy-i' style={{ width: '90%' }} /></View></View>
                <Text className='m-up'>90 ↑</Text></View>
              <View className='btn' onClick={() => go('review')}>最后一题：以前的小怪兽来啦 →</View>
            </View>
          )}
        </View>
      )}

      {/* 6. 艾宾浩斯复习 */}
      {screen === 'review' && (
        <View>
          <View className='topbar'><View className='back' onClick={() => go('feynman')}>‹</View><View className='h1'>复习挑战 ⏰</View><Dots on={5} /></View>
          <View className='card'>
            <View className='row'><View className='avatar'>🦖</View><View className='bubble'>还记得我吗？4 天前你驯服过我！我饿了，想再考考你 😋</View></View>
            <View className='mt-s'><Text className='tag'>小数加减法 · 第 3 次复习</Text></View>
            <View className='qbox'>计算：0.8 + 0.15 = ?</View>
            <View className='opts'>
              {['0.23', '0.95', '1.05', '0.85'].map((o, i) => (
                <View key={i} className={'opt ' + (rPicked === i ? (i === 1 ? 'opt-right' : 'opt-wrong') : '')} onClick={() => pickR(i)}>{o}</View>
              ))}
            </View>
            {rResult === 'wrong' && <View className='note'>咦，小数点对齐了吗？再试一次 😊（答错只会回到更近的复习点，不会白学）</View>}
            {rResult === 'right' && (
              <View>
                <View className='note note-good'>✅ 记得牢牢的！小数点能量 +20 → 100，点亮啦 💡 下次 7 天后再见～</View>
                <View className='btn' onClick={finish}>完成今日打卡 🎉</View>
              </View>
            )}
          </View>
        </View>
      )}

      {/* 7. 打卡成功 */}
      {screen === 'done' && (
        <View>
          <View className='celebrate'>
            <View className='big-emoji'>🎉</View>
            <View className='celebrate-h'>今日打卡完成！</View>
            <View className='muted'>🔥 连续打卡 {streak} 天 · 此处有撒花动画占位</View>
          </View>
          <View className='ticket'>
            <View>🎫 你获得一张游戏券</View>
            <View className='ticket-b'>10 分钟 · 蛋仔派对</View>
            <View className='ticket-sub'>去找爸爸妈妈兑换吧～</View>
          </View>
          <View className='card'>
            <View className='title'>今天的收获</View>
            <View className='monster'><Text className='m-emoji'>👾</Text>
              <View className='m-body'><View className='m-name'>阿通分 · 分数加减法</View>
                <View className='energy'><View className='energy-i' style={{ width: '90%' }} /></View></View>
              <Text className='m-up'>90 ↑</Text></View>
            <View className='monster'><Text className='m-emoji'>🦖✨</Text>
              <View className='m-body'><View className='m-name'>小数点 · 已点亮！获得徽章 🏅</View>
                <View className='energy'><View className='energy-i' style={{ width: '100%' }} /></View></View>
              <Text className='m-up'>100</Text></View>
          </View>
          <View className='btn btn-big' onClick={() => go('home')}>回到首页</View>
          <View className='placeholder'>家长设置区同步显示「今日已打卡，可发放奖励」（第二批原型）</View>
        </View>
      )}

    </View>
  )
}
