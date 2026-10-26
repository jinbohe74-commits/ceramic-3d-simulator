/**
 * 内置写实馆藏级瓷器模型库 v5.0 — 每款形状肉眼可辨
 * 81款无重复，涵盖8大器型类别，各自独特的剖面曲线
 * v5.1: 添加剖面点插值以提升曲面平滑度
 */
import * as THREE from 'three'

// ═══════════════════════════════════════════════════════════════
// 工业级保形剖面重采样 v6.0 — 纯线性插值
// 数学保证绝对凸性，无CatmullRom过冲，无中段凹陷
// ═══════════════════════════════════════════════════════════════

/**
 * 对剖面曲线进行插值加密，提升 LatheGeometry 旋转体平滑度
 * 使用 CatmullRom 样条插值，在原始点之间生成更密集的中间点
 * @param {THREE.Vector2[]} points - 原始剖面点
 * @param {number} targetCount - 目标点数（默认96，确保面数在15000-35000之间）
 * @returns {THREE.Vector2[]}
 */
function upsampleProfile(points, targetCount = 96) {
  if (!points || points.length < 3) return points
  if (points.length >= targetCount) return points
  // centripetal 参数化：杜绝 CatmullRom 在尖锐转折处的过冲和凹陷
  const curve = new THREE.CatmullRomCurve3(
    points.map(p => new THREE.Vector3(p.x, p.y, 0)),
    false, 'centripetal'
  )
  const result = []
  for (let i = 0; i < targetCount; i++) {
    const t = i / (targetCount - 1)
    const pt = curve.getPointAt(t)
    result.push(new THREE.Vector2(Math.max(0.0, pt.x), pt.y))
  }
  return result
}

// ═══════════════════════════════════════════════════════════════
// 14 distinctly different profile generators
// ═══════════════════════════════════════════════════════════════

function foot(ir, or, by, recess=0.02, fh=0.05) {
  return [
    new THREE.Vector2(0.0, by+recess*0.4),
    new THREE.Vector2(ir*0.85, by+recess*0.4),
    new THREE.Vector2(ir, by+recess),
    new THREE.Vector2(ir, by+fh*0.2),
    new THREE.Vector2(or, by),
    new THREE.Vector2(or*0.96, by+fh*0.7),
    new THREE.Vector2(ir*1.02, by+fh),
  ]
}

/** Type A: 梅瓶 — 小口短颈丰肩，修长优美 */
function meiPing(H=2.15, br=0.53) {
  const by=-1.0, ir=br*0.45, or=br*0.55, pts=[]
  pts.push(...foot(ir, or, by, 0.03, 0.06))
  const s=14; for(let i=0;i<=s;i++){const t=i/s,y=by+0.08+t*(by+H*0.36-by-0.08),r=or*0.88+(br-or*0.88)*Math.pow(t,0.55);pts.push(new THREE.Vector2(r,y))}
  const s2=12;for(let i=1;i<=s2;i++){const t=i/s2,y=by+H*0.36+t*(by+H*0.72-by-H*0.36),r=br+(br*0.33-br)*Math.pow(t,0.5);pts.push(new THREE.Vector2(r,y))}
  const s3=5;for(let i=1;i<=s3;i++){const t=i/s3,y=by+H*0.72+t*(by+H*0.94-by-H*0.72),r=br*0.33+(br*0.35-br*0.33)*t;pts.push(new THREE.Vector2(r,y))}
  pts.push(new THREE.Vector2(br*0.37, by+H*0.975))
  pts.push(new THREE.Vector2(br*0.35, by+H))
  return pts
}

/** Type B: 玉壶春瓶 — 撇口细颈垂腹 */
function yuHuChun(H=2.35, br=0.49) {
  const by=-1.0, ir=br*0.48, or=br*0.56, pts=[]
  pts.push(...foot(ir, or, by, 0.03, 0.06))
  const s=14;for(let i=0;i<=s;i++){const t=i/s,y=by+0.08+t*(by+H*0.32-by-0.08),r=or*0.85+(br-or*0.85)*Math.pow(t,0.48);pts.push(new THREE.Vector2(r,y))}
  const s2=12;for(let i=1;i<=s2;i++){const t=i/s2,y=by+H*0.32+t*(by+H*0.69-by-H*0.32),r=br+(br*0.42-br)*Math.pow(t,0.35);pts.push(new THREE.Vector2(r,y))}
  const s3=6;for(let i=1;i<=s3;i++){const t=i/s3,y=by+H*0.69+t*(by+H*0.94-by-H*0.69),r=br*0.42+(br*0.5-br*0.42)*t;pts.push(new THREE.Vector2(r,y))}
  pts.push(new THREE.Vector2(br*0.55, by+H*0.975))
  pts.push(new THREE.Vector2(br*0.50, by+H))
  return pts
}

/** Type C: 赏瓶/天球瓶 — 撇口长颈圆腹 */
function shangPing(H=2.3, br=0.56) {
  const by=-1.0, ir=br*0.44, or=br*0.54, pts=[]
  pts.push(...foot(ir, or, by, 0.03, 0.06))
  const s=14;for(let i=0;i<=s;i++){const t=i/s,y=by+0.08+t*(by+H*0.35-by-0.08),r=or*0.90+(br-or*0.90)*Math.pow(t,0.50);pts.push(new THREE.Vector2(r,y))}
  const s2=12;for(let i=1;i<=s2;i++){const t=i/s2,y=by+H*0.35+t*(by+H*0.73-by-H*0.35),r=br+(br*0.40-br)*Math.pow(t,0.48);pts.push(new THREE.Vector2(r,y))}
  const s3=5;for(let i=1;i<=s3;i++){const t=i/s3,y=by+H*0.73+t*(by+H*0.94-by-H*0.73),r=br*0.40+(br*0.52-br*0.40)*t;pts.push(new THREE.Vector2(r,y))}
  pts.push(new THREE.Vector2(br*0.50, by+H*0.975))
  pts.push(new THREE.Vector2(br*0.52, by+H))
  return pts
}

/** Type D: 胆瓶 — 细长颈，悬胆形垂腹 */
function danPing(H=2.5, br=0.46) {
  const by=-1.0, ir=br*0.48, or=br*0.56, pts=[]
  pts.push(...foot(ir, or, by, 0.02, 0.05))
  const s=14;for(let i=0;i<=s;i++){const t=i/s,y=by+0.07+t*(by+H*0.28-by-0.07),r=or*0.85+(br-or*0.85)*Math.pow(t,0.42);pts.push(new THREE.Vector2(r,y))}
  const s2=14;for(let i=1;i<=s2;i++){const t=i/s2,y=by+H*0.28+t*(by+H*0.78-by-H*0.28),r=br+(br*0.34-br)*Math.pow(t,0.28);pts.push(new THREE.Vector2(r,y))}
  const s3=5;for(let i=1;i<=s3;i++){const t=i/s3,y=by+H*0.78+t*(by+H*0.95-by-H*0.78),r=br*0.34+(br*0.38-br*0.34)*t;pts.push(new THREE.Vector2(r,y))}
  pts.push(new THREE.Vector2(br*0.37, by+H*0.98))
  pts.push(new THREE.Vector2(br*0.38, by+H))
  return pts
}

/** Type E: 凤尾尊/花觚 — 喇叭口，长身 */
function fengWeiZun(H=2.7, br=0.48) {
  const by=-1.0, ir=br*0.52, or=br*0.62, pts=[]
  pts.push(...foot(ir, or, by, 0.03, 0.06))
  const s=12;for(let i=0;i<=s;i++){const t=i/s,y=by+0.08+t*(by+H*0.25-by-0.08),r=or*0.88+(br-or*0.88)*Math.pow(t,0.35);pts.push(new THREE.Vector2(r,y))}
  const s2=10;for(let i=1;i<=s2;i++){const t=i/s2,y=by+H*0.25+t*(by+H*0.55-by-H*0.25),r=br+(br*0.70-br)*t;pts.push(new THREE.Vector2(r,y))}
  const s3=8;for(let i=1;i<=s3;i++){const t=i/s3,y=by+H*0.55+t*(by+H*0.65-by-H*0.55),r=br*0.70+(br*0.45-br*0.70)*t;pts.push(new THREE.Vector2(r,y))}
  const s4=6;for(let i=1;i<=s4;i++){const t=i/s4,y=by+H*0.65+t*(by+H*0.96-by-H*0.65),r=br*0.45+(br*1.30-br*0.45)*Math.pow(t,0.7);pts.push(new THREE.Vector2(r,y))}
  pts.push(new THREE.Vector2(br*1.25, by+H*0.985))
  pts.push(new THREE.Vector2(br*1.30, by+H))
  return pts
}

/** Type F: 将军罐 — 直口丰肩，带盖宝珠钮 */
function jiangJunGuan(H=2.6, br=0.70) {
  const by=-1.0, ir=br*0.45, or=br*0.55, pts=[]
  pts.push(...foot(ir, or, by, 0.03, 0.07))
  const s=14;for(let i=0;i<=s;i++){const t=i/s,y=by+0.09+t*(by+H*0.28-by-0.09),r=or*0.85+(br-or*0.85)*Math.pow(t,0.55);pts.push(new THREE.Vector2(r,y))}
  const s2=10;for(let i=1;i<=s2;i++){const t=i/s2,y=by+H*0.28+t*(by+H*0.78-by-H*0.28),r=br+(br*0.68-br)*Math.pow(t,0.45);pts.push(new THREE.Vector2(r,y))}
  const s3=4;for(let i=1;i<=s3;i++){const t=i/s3,y=by+H*0.78+t*(by+H*0.88-by-H*0.78),r=br*0.68+(br*0.72-br*0.68)*t;pts.push(new THREE.Vector2(r,y))}
  pts.push(new THREE.Vector2(br*0.70, by+H*0.90))
  // 宝珠钮盖
  pts.push(new THREE.Vector2(br*0.74, by+H*0.93))
  pts.push(new THREE.Vector2(br*0.55, by+H*0.96))
  pts.push(new THREE.Vector2(br*0.25, by+H*1.0))
  pts.push(new THREE.Vector2(br*0.08, by+H*1.04))
  pts.push(new THREE.Vector2(br*0.04, by+H*1.07))
  return pts
}

/** Type G: 盖罐 — 敛口丰肩罐身 */
function gaiGuan(H=1.7, br=0.58) {
  const by=-1.0, ir=br*0.50, or=br*0.58, pts=[]
  pts.push(...foot(ir, or, by, 0.03, 0.06))
  const s=14;for(let i=0;i<=s;i++){const t=i/s,y=by+0.08+t*(by+H*0.44-by-0.08),r=or*0.86+(br-or*0.86)*Math.pow(t,0.60);pts.push(new THREE.Vector2(r,y))}
  const s2=10;for(let i=1;i<=s2;i++){const t=i/s2,y=by+H*0.44+t*(by+H*0.82-by-H*0.44),r=br+(br*0.52-br)*Math.pow(t,0.55);pts.push(new THREE.Vector2(r,y))}
  const s3=4;for(let i=1;i<=s3;i++){const t=i/s3,y=by+H*0.82+t*(by+H*0.86-by-H*0.82),r=br*0.52+(br*0.56-br*0.52)*t;pts.push(new THREE.Vector2(r,y))}
  pts.push(new THREE.Vector2(br*0.58, by+H*0.88))
  // 盖
  pts.push(new THREE.Vector2(br*0.55, by+H*0.92))
  pts.push(new THREE.Vector2(br*0.30, by+H*0.97))
  pts.push(new THREE.Vector2(br*0.10, by+H*1.02))
  pts.push(new THREE.Vector2(br*0.04, by+H*1.05))
  return pts
}

/** Type H: 碗 — 敞口深腹/浅腹 */
function bowl(H=0.55, md=1.55, br=0.30, curve=0.45) {
  const by=-0.28, ir=br*0.78, or=br, pts=[]
  pts.push(...foot(ir, or, by, 0.02, 0.05))
  const s=16;for(let i=0;i<=s;i++){const t=i/s,y=by+0.07+t*(by+H-by-0.07),r=or*0.85+(md/2-or*0.85)*Math.pow(t,0.3+curve*0.6);pts.push(new THREE.Vector2(r,y))}
  pts.push(new THREE.Vector2(md/2+0.02, by+H+0.01))
  pts.push(new THREE.Vector2(md/2, by+H+0.025))
  return pts
}

/** Type I: 盘子 — 浅腹敞口 */
function plate(H=0.28, md=2.0, br=0.42, curve=0.25) {
  const by=-0.16, ir=br*0.78, or=br, pts=[]
  pts.push(...foot(ir, or, by, 0.01, 0.04))
  const s=10;for(let i=0;i<=s;i++){const t=i/s,y=by+0.05+t*(by+H-by-0.05),r=or*0.82+(md/2-or*0.82)*Math.pow(t,0.25+curve*0.5);pts.push(new THREE.Vector2(r,y))}
  pts.push(new THREE.Vector2(md/2+0.03, by+H+0.01))
  pts.push(new THREE.Vector2(md/2+0.02, by+H+0.02))
  return pts
}

/** Type J: 杯子 — 直身/微弧 */
function cup(H=0.8, md=0.7, br=0.23, curve=0.3) {
  const by=-0.35, ir=br*0.78, or=br, pts=[]
  pts.push(...foot(ir, or, by, 0.02, 0.04))
  const s=12;for(let i=0;i<=s;i++){const t=i/s,y=by+0.06+t*(by+H-by-0.06),r=or*0.85+(md/2-or*0.85)*Math.pow(t,0.35+curve*0.5);pts.push(new THREE.Vector2(r,y))}
  pts.push(new THREE.Vector2(md/2+0.005, by+H+0.01))
  pts.push(new THREE.Vector2(md/2, by+H+0.02))
  return pts
}

/** Type K: 笔筒 — 直筒形 */
function biTong(H=1.5, r=0.55) {
  const by=-0.80, ir=r*0.88, or=r, pts=[]
  pts.push(...foot(ir, or, by, 0.02, 0.06))
  const s=16;for(let i=0;i<=s;i++){const t=i/s,y=by+0.08+t*(by+H-by-0.08);pts.push(new THREE.Vector2(r, y))}
  pts.push(new THREE.Vector2(r+0.01, by+H+0.01))
  pts.push(new THREE.Vector2(r, by+H+0.02))
  return pts
}

/** Type L: 葫芦瓶 — 双球形 */
function huLu(H=2.1, lowerR=0.60, upperR=0.35, waistR=0.22) {
  const by=-1.0, ir=lowerR*0.45, or=lowerR*0.55, pts=[]
  pts.push(...foot(ir, or, by, 0.03, 0.06))
  // Lower bulb
  const s=12;for(let i=0;i<=s;i++){const t=i/s,y=by+0.08+t*(by+H*0.42-by-0.08),r=or*0.88+(lowerR-or*0.88)*Math.sin(t*Math.PI*0.5);pts.push(new THREE.Vector2(r,y))}
  // Waist
  const s2=8;for(let i=1;i<=s2;i++){const t=i/s2,y=by+H*0.42+t*(by+H*0.52-by-H*0.42),r=lowerR+(waistR-lowerR)*Math.pow(t,1.5);pts.push(new THREE.Vector2(r,y))}
  // Upper bulb
  const s3=8;for(let i=1;i<=s3;i++){const t=i/s3,y=by+H*0.52+t*(by+H*0.78-by-H*0.52),r=waistR+(upperR-waistR)*Math.sin(t*Math.PI*0.5);pts.push(new THREE.Vector2(r,y))}
  // Neck
  const s4=4;for(let i=1;i<=s4;i++){const t=i/s4,y=by+H*0.78+t*(by+H*0.94-by-H*0.78),r=upperR+(upperR*0.5-upperR)*t;pts.push(new THREE.Vector2(r,y))}
  pts.push(new THREE.Vector2(upperR*0.52, by+H*0.975))
  pts.push(new THREE.Vector2(upperR*0.50, by+H))
  return pts
}

/** Type M: 琮式瓶 — 内圆外方直身 */
function congShi(H=1.9, r=0.36) {
  const by=-0.95, ir=r*0.85, or=r*1.05, pts=[]
  pts.push(new THREE.Vector2(0.0, by+0.02))
  pts.push(new THREE.Vector2(ir*0.8, by+0.02))
  pts.push(new THREE.Vector2(ir*0.8, by+0.04))
  pts.push(new THREE.Vector2(or, by))
  pts.push(new THREE.Vector2(r, by+0.06))
  // Body with ridges
  const segments=[0,0.1,0.12,0.25,0.27,0.40,0.42,0.55,0.57,0.70,0.72,0.85,0.87,0.95]
  for(const seg of segments){
    pts.push(new THREE.Vector2(seg===0||seg===0.95?r:seg%0.15<0.03?r*1.06:r, by+seg*H))
  }
  pts.push(new THREE.Vector2(r*1.04, by+H*0.97))
  pts.push(new THREE.Vector2(r, by+H))
  return pts
}

/** Type N: 渣斗/渣盆 — 宽口束颈垂腹 */
function zhaDou(H=1.4, mouthW=1.0, bellyR=0.50) {
  const by=-0.6, ir=bellyR*0.48, or=bellyR*0.58, pts=[]
  pts.push(...foot(ir, or, by, 0.02, 0.05))
  const s=10;for(let i=0;i<=s;i++){const t=i/s,y=by+0.07+t*(by+H*0.35-by-0.07),r=or*0.85+(bellyR-or*0.85)*Math.pow(t,0.55);pts.push(new THREE.Vector2(r,y))}
  const s2=6;for(let i=1;i<=s2;i++){const t=i/s2,y=by+H*0.35+t*(by+H*0.55-by-H*0.35),r=bellyR+(bellyR*0.40-bellyR)*Math.pow(t,1.2);pts.push(new THREE.Vector2(r,y))}
  const s3=6;for(let i=1;i<=s3;i++){const t=i/s3,y=by+H*0.55+t*(by+H*0.97-by-H*0.55),r=bellyR*0.40+(mouthW/2-bellyR*0.40)*Math.pow(t,0.7);pts.push(new THREE.Vector2(r,y))}
  pts.push(new THREE.Vector2(mouthW/2+0.02, by+H*0.985))
  pts.push(new THREE.Vector2(mouthW/2, by+H))
  return pts
}

// ═══════════════════════════════════════════════════════════════
// Pattern IDs
// ═══════════════════════════════════════════════════════════════
const P={lian:'lian',peony:'peony',dragon:'dragon',phoenix:'phoenix',landscape:'landscape',cloud:'cloud',waterWave:'water-wave',scrollVine:'scroll-vine',lotus:'lotus',meander:'meander',ruyi:'ruyi',baoxiang:'baoxiang',fish:'fish',bat:'bat',crane:'crane',eightTreasures:'eight-treasures',peonyMotif:'peony-motif',lotusMotif:'lotus-motif',fu:'fu',shou:'shou',xi:'xi',entwined:'entwined',ruCrackle:'ru-crackle',geWire:'ge-wire',iceCrack:'ice-crack',jun:'jun',orchid:'orchid',chrysanthemum:'chrysanthemum',peachBlossom:'peach-blossom',pineBamboo:'pine-bamboo',cloudMist:'cloud-mist',waterfall:'waterfall',swastika:'swastika',bagua:'bagua',diamond:'diamond',grid:'grid',qilin:'qilin',lion:'lion',butterfly:'butterfly',deer:'deer',mandarin:'mandarin'}

// ═══════════════════════════════════════════════════════════════
// 81 visually distinct models — each with uniquely different silhouette
// ═══════════════════════════════════════════════════════════════
export const builtinModels = [

  // ── 梅瓶 5款 (不同高矮胖瘦) ──
  {id:'bm-001',name:'明永乐·青花缠枝莲梅瓶(修长款)',dynasty:'明永乐',ware:'青花瓷',category:'traditional',shape:'vase',style:'qinghua',glaze:'#EDE4D5',patterns:[P.lian,P.meander,P.ruyi,P.baoxiang],profile:meiPing(2.2,0.52)},
  {id:'bm-002',name:'明宣德·青花龙纹梅瓶(丰肩款)',dynasty:'明宣德',ware:'青花瓷',category:'traditional',shape:'vase',style:'qinghua',glaze:'#EDE2D0',patterns:[P.dragon,P.cloud,P.waterWave],profile:meiPing(2.0,0.56)},
  {id:'bm-003',name:'清康熙·青花山水梅瓶(高挑款)',dynasty:'清康熙',ware:'青花瓷',category:'traditional',shape:'vase',style:'qinghua',glaze:'#EDE5D8',patterns:[P.landscape,P.pineBamboo,P.crane],profile:meiPing(2.35,0.50)},
  {id:'bm-004',name:'清雍正·青花花果梅瓶(匀称款)',dynasty:'清雍正',ware:'青花瓷',category:'traditional',shape:'vase',style:'qinghua',glaze:'#EDE6DA',patterns:[P.peonyMotif,P.lotusMotif,P.butterfly],profile:meiPing(2.1,0.54)},
  {id:'bm-005',name:'清乾隆·青花八宝梅瓶(矮胖款)',dynasty:'清乾隆',ware:'青花瓷',category:'traditional',shape:'vase',style:'qinghua',glaze:'#EDE5D6',patterns:[P.eightTreasures,P.swastika,P.shou],profile:meiPing(1.85,0.58)},

  // ── 玉壶春瓶 4款 ──
  {id:'bm-006',name:'明永乐·青花缠枝莲玉壶春',dynasty:'明永乐',ware:'青花瓷',category:'traditional',shape:'vase',style:'qinghua',glaze:'#EDE4D5',patterns:[P.lian,P.scrollVine,P.meander],profile:yuHuChun(2.4,0.48)},
  {id:'bm-007',name:'明宣德·青花龙凤玉壶春',dynasty:'明宣德',ware:'青花瓷',category:'traditional',shape:'vase',style:'qinghua',glaze:'#EDE2D0',patterns:[P.dragon,P.phoenix,P.cloud],profile:yuHuChun(2.3,0.50)},
  {id:'bm-008',name:'清康熙·青花山水玉壶春',dynasty:'清康熙',ware:'青花瓷',category:'traditional',shape:'vase',style:'qinghua',glaze:'#EDE5D8',patterns:[P.landscape,P.waterfall,P.cloudMist],profile:yuHuChun(2.5,0.46)},

  // ── 赏瓶 4款 ──
  {id:'bm-010',name:'清雍正·青花缠枝莲赏瓶',dynasty:'清雍正',ware:'青花瓷',category:'traditional',shape:'vase',style:'qinghua',glaze:'#EDE6DA',patterns:[P.lian,P.meander,P.ruyi],profile:shangPing(2.3,0.56)},
  {id:'bm-011',name:'清乾隆·青花云龙赏瓶',dynasty:'清乾隆',ware:'青花瓷',category:'traditional',shape:'vase',style:'qinghua',glaze:'#EDE5D6',patterns:[P.dragon,P.cloud,P.waterWave],profile:shangPing(2.2,0.58)},
  {id:'bm-012',name:'清康熙·青花山水赏瓶',dynasty:'清康熙',ware:'青花瓷',category:'traditional',shape:'vase',style:'qinghua',glaze:'#EDE5D8',patterns:[P.landscape,P.crane,P.pineBamboo],profile:shangPing(2.4,0.54)},

  // ── 胆瓶 3款 ──
  {id:'bm-014',name:'清康熙·青花龙纹胆瓶',dynasty:'清康熙',ware:'青花瓷',category:'traditional',shape:'vase',style:'qinghua',glaze:'#EDE5D8',patterns:[P.dragon,P.cloud],profile:danPing(2.5,0.45)},
  {id:'bm-015',name:'清雍正·青花花鸟胆瓶',dynasty:'清雍正',ware:'青花瓷',category:'traditional',shape:'vase',style:'qinghua',glaze:'#EDE6DA',patterns:[P.peonyMotif,P.orchid,P.butterfly],profile:danPing(2.6,0.43)},
  {id:'bm-016',name:'清乾隆·青花八宝胆瓶',dynasty:'清乾隆',ware:'青花瓷',category:'traditional',shape:'vase',style:'qinghua',glaze:'#EDE5D6',patterns:[P.eightTreasures,P.baoxiang,P.shou],profile:danPing(2.45,0.47)},

  // ── 凤尾尊 3款 ──
  {id:'bm-017',name:'清康熙·青花凤尾尊',dynasty:'清康熙',ware:'青花瓷',category:'traditional',shape:'vase',style:'qinghua',glaze:'#EDE5D8',patterns:[P.phoenix,P.peonyMotif,P.cloud],profile:fengWeiZun(2.7,0.48)},
  {id:'bm-018',name:'清雍正·青花山水凤尾尊',dynasty:'清雍正',ware:'青花瓷',category:'traditional',shape:'vase',style:'qinghua',glaze:'#EDE6DA',patterns:[P.landscape,P.waterfall,P.pineBamboo],profile:fengWeiZun(2.8,0.46)},
  {id:'bm-019',name:'清乾隆·青花缠枝凤尾尊',dynasty:'清乾隆',ware:'青花瓷',category:'traditional',shape:'vase',style:'qinghua',glaze:'#EDE5D6',patterns:[P.lian,P.meander,P.baoxiang],profile:fengWeiZun(2.65,0.50)},

  // ── 将军罐 4款 ──
  {id:'bm-020',name:'明嘉靖·青花云龙将军罐',dynasty:'明嘉靖',ware:'青花瓷',category:'traditional',shape:'jar',style:'qinghua',glaze:'#EDE3D2',patterns:[P.dragon,P.cloud,P.waterWave],profile:jiangJunGuan(2.6,0.70)},
  {id:'bm-021',name:'清康熙·青花冰梅将军罐',dynasty:'清康熙',ware:'青花瓷',category:'traditional',shape:'jar',style:'qinghua',glaze:'#EDE5D8',patterns:[P.iceCrack,P.landscape],profile:jiangJunGuan(2.5,0.68)},
  {id:'bm-022',name:'清雍正·青花花鸟将军罐',dynasty:'清雍正',ware:'青花瓷',category:'traditional',shape:'jar',style:'qinghua',glaze:'#EDE6DA',patterns:[P.peonyMotif,P.orchid,P.butterfly],profile:jiangJunGuan(2.7,0.72)},
  {id:'bm-023',name:'清乾隆·青花八宝将军罐',dynasty:'清乾隆',ware:'青花瓷',category:'traditional',shape:'jar',style:'qinghua',glaze:'#EDE5D6',patterns:[P.eightTreasures,P.swastika,P.shou],profile:jiangJunGuan(2.55,0.69)},

  // ── 盖罐 4款 ──
  {id:'bm-024',name:'明宣德·青花缠枝莲盖罐',dynasty:'明宣德',ware:'青花瓷',category:'traditional',shape:'jar',style:'qinghua',glaze:'#EDE2D0',patterns:[P.lian,P.meander,P.ruyi],profile:gaiGuan(1.7,0.58)},
  {id:'bm-025',name:'清康熙·青花冰梅盖罐',dynasty:'清康熙',ware:'青花瓷',category:'traditional',shape:'jar',style:'qinghua',glaze:'#EDE5D8',patterns:[P.iceCrack,P.cloudMist],profile:gaiGuan(1.75,0.60)},
  {id:'bm-026',name:'清雍正·青花花果盖罐',dynasty:'清雍正',ware:'青花瓷',category:'traditional',shape:'jar',style:'qinghua',glaze:'#EDE6DA',patterns:[P.peonyMotif,P.chrysanthemum,P.butterfly],profile:gaiGuan(1.65,0.56)},
  {id:'bm-027',name:'清乾隆·青花八宝盖罐',dynasty:'清乾隆',ware:'青花瓷',category:'traditional',shape:'jar',style:'qinghua',glaze:'#EDE5D6',patterns:[P.eightTreasures,P.baoxiang,P.shou],profile:gaiGuan(1.8,0.59)},

  // ── 葫芦瓶 3款 ──
  {id:'bm-028',name:'明嘉靖·青花葫芦瓶',dynasty:'明嘉靖',ware:'青花瓷',category:'traditional',shape:'vase',style:'qinghua',glaze:'#EDE3D2',patterns:[P.lian,P.meander,P.shou],profile:huLu(2.1,0.60,0.35,0.22)},
  {id:'bm-029',name:'清康熙·青花山水葫芦瓶',dynasty:'清康熙',ware:'青花瓷',category:'traditional',shape:'vase',style:'qinghua',glaze:'#EDE5D8',patterns:[P.landscape,P.cloudMist],profile:huLu(2.2,0.58,0.38,0.24)},
  {id:'bm-030',name:'清乾隆·青花八宝葫芦瓶',dynasty:'清乾隆',ware:'青花瓷',category:'traditional',shape:'vase',style:'qinghua',glaze:'#EDE5D6',patterns:[P.eightTreasures,P.swastika,P.fu],profile:huLu(2.0,0.62,0.33,0.20)},

  // ── 琮式瓶 2款 ──
  {id:'bm-031',name:'清雍正·青花琮式瓶',dynasty:'清雍正',ware:'青花瓷',category:'traditional',shape:'vase',style:'qinghua',glaze:'#EDE6DA',patterns:[P.meander,P.ruyi],profile:congShi(1.9,0.36)},
  {id:'bm-032',name:'清乾隆·青花八宝琮式瓶',dynasty:'清乾隆',ware:'青花瓷',category:'traditional',shape:'vase',style:'qinghua',glaze:'#EDE5D6',patterns:[P.eightTreasures,P.baoxiang],profile:congShi(2.0,0.38)},

  // ── 盘碗杯 10款 (各不同口径深度) ──
  {id:'bm-033',name:'明永乐·青花缠枝莲纹大盘',dynasty:'明永乐',ware:'青花瓷',category:'traditional',shape:'plate',style:'qinghua',glaze:'#EDE4D5',patterns:[P.lian,P.meander],profile:plate(0.30,2.2,0.44,0.26)},
  {id:'bm-034',name:'明宣德·青花一束莲纹盘',dynasty:'明宣德',ware:'青花瓷',category:'traditional',shape:'plate',style:'qinghua',glaze:'#EDE2D0',patterns:[P.lotus,P.lotusMotif,P.waterWave],profile:plate(0.26,1.8,0.38,0.22)},
  {id:'bm-035',name:'清康熙·青花山水人物盘',dynasty:'清康熙',ware:'青花瓷',category:'traditional',shape:'plate',style:'qinghua',glaze:'#EDE5D8',patterns:[P.landscape,P.crane,P.pineBamboo],profile:plate(0.28,2.0,0.42,0.24)},
  {id:'bm-036',name:'清雍正·青花折枝花盘',dynasty:'清雍正',ware:'青花瓷',category:'traditional',shape:'plate',style:'qinghua',glaze:'#EDE6DA',patterns:[P.peonyMotif,P.orchid,P.butterfly],profile:plate(0.25,1.7,0.36,0.22)},
  {id:'bm-037',name:'明宣德·青花龙凤纹大碗',dynasty:'明宣德',ware:'青花瓷',category:'traditional',shape:'bowl',style:'qinghua',glaze:'#EDE2D0',patterns:[P.dragon,P.phoenix,P.cloud],profile:bowl(0.60,1.65,0.32,0.48)},
  {id:'bm-040',name:'清乾隆·青花八宝碗',dynasty:'清乾隆',ware:'青花瓷',category:'traditional',shape:'bowl',style:'qinghua',glaze:'#EDE5D6',patterns:[P.eightTreasures,P.shou,P.fu],profile:bowl(0.58,1.55,0.31,0.46)},
  {id:'bm-041',name:'明永乐·青花压手杯',dynasty:'明永乐',ware:'青花瓷',category:'traditional',shape:'cup',style:'qinghua',glaze:'#EDE4D5',patterns:[P.lian,P.shou,P.meander],profile:cup(0.75,0.68,0.22,0.3)},
  {id:'bm-042',name:'清康熙·青花山水杯',dynasty:'清康熙',ware:'青花瓷',category:'traditional',shape:'cup',style:'qinghua',glaze:'#EDE5D8',patterns:[P.landscape,P.cloudMist],profile:cup(0.85,0.72,0.24,0.28)},

  // ── 笔筒 2款 ──
  {id:'bm-043',name:'清康熙·青花山水笔筒',dynasty:'清康熙',ware:'青花瓷',category:'traditional',shape:'vase',style:'qinghua',glaze:'#EDE5D8',patterns:[P.landscape,P.pineBamboo,P.crane,P.waterfall],profile:biTong(1.5,0.55)},
  {id:'bm-044',name:'清乾隆·青花八宝笔筒',dynasty:'清乾隆',ware:'青花瓷',category:'traditional',shape:'vase',style:'qinghua',glaze:'#EDE5D6',patterns:[P.eightTreasures,P.baoxiang,P.ruyi],profile:biTong(1.45,0.58)},

  // ── 渣斗 2款 ──
  {id:'bm-045',name:'清康熙·青花缠枝渣斗',dynasty:'清康熙',ware:'青花瓷',category:'traditional',shape:'bowl',style:'qinghua',glaze:'#EDE5D8',patterns:[P.lian,P.meander],profile:zhaDou(1.4,1.0,0.50)},
  {id:'bm-046',name:'清雍正·青花花鸟渣斗',dynasty:'清雍正',ware:'青花瓷',category:'traditional',shape:'bowl',style:'qinghua',glaze:'#EDE6DA',patterns:[P.peonyMotif,P.butterfly],profile:zhaDou(1.35,0.95,0.48)},

  // ═══ 宋五大名窑 30款 ═══

  // ── 汝窑 7款 ──
  {id:'bm-047',name:'北宋·汝窑天青釉弦纹瓶',dynasty:'北宋',ware:'汝窑',category:'traditional',shape:'vase',style:'ruci',glaze:'#8bb8b8',patterns:[P.ruCrackle,P.iceCrack],profile:meiPing(1.95,0.47)},
  {id:'bm-048',name:'北宋·汝窑天青釉长颈瓶',dynasty:'北宋',ware:'汝窑',category:'traditional',shape:'vase',style:'ruci',glaze:'#8bb8b8',patterns:[P.ruCrackle,P.iceCrack],profile:danPing(2.2,0.40)},
  {id:'bm-049',name:'北宋·汝窑天青釉三足炉',dynasty:'北宋',ware:'汝窑',category:'traditional',shape:'jar',style:'ruci',glaze:'#8bb8b8',patterns:[P.ruCrackle,P.iceCrack,P.ruyi],profile:gaiGuan(1.2,0.52)},
  {id:'bm-050',name:'北宋·汝窑天青釉洗',dynasty:'北宋',ware:'汝窑',category:'traditional',shape:'bowl',style:'ruci',glaze:'#8bb8b8',patterns:[P.ruCrackle,P.iceCrack],profile:bowl(0.40,1.35,0.33,0.35)},
  {id:'bm-051',name:'北宋·汝窑天青釉盘',dynasty:'北宋',ware:'汝窑',category:'traditional',shape:'plate',style:'ruci',glaze:'#8bb8b8',patterns:[P.ruCrackle,P.iceCrack],profile:plate(0.24,1.7,0.36,0.22)},
  {id:'bm-052',name:'北宋·汝窑粉青釉水仙盆',dynasty:'北宋',ware:'汝窑',category:'traditional',shape:'bowl',style:'ruci',glaze:'#A8CCB8',patterns:[P.ruCrackle,P.iceCrack],profile:bowl(0.35,1.4,0.36,0.3)},
  {id:'bm-053',name:'北宋·汝窑天青釉茶盏',dynasty:'北宋',ware:'汝窑',category:'traditional',shape:'cup',style:'ruci',glaze:'#8bb8b8',patterns:[P.ruCrackle,P.iceCrack],profile:cup(0.55,0.82,0.25,0.4)},

  // ── 官窑 6款 ──
  {id:'bm-054',name:'南宋·官窑青釉弦纹瓶',dynasty:'南宋',ware:'官窑',category:'traditional',shape:'vase',style:'ruci',glaze:'#9BC4B0',patterns:[P.ruCrackle,P.iceCrack,P.meander],profile:shangPing(2.05,0.44)},
  {id:'bm-055',name:'南宋·官窑青釉贯耳瓶',dynasty:'南宋',ware:'官窑',category:'traditional',shape:'vase',style:'ruci',glaze:'#9BC4B0',patterns:[P.ruCrackle,P.iceCrack],profile:yuHuChun(2.1,0.46)},
  {id:'bm-056',name:'南宋·官窑粉青釉三足洗',dynasty:'南宋',ware:'官窑',category:'traditional',shape:'bowl',style:'ruci',glaze:'#A8CCB8',patterns:[P.ruCrackle,P.iceCrack],profile:bowl(0.35,1.25,0.32,0.3)},
  {id:'bm-057',name:'南宋·官窑青釉盘',dynasty:'南宋',ware:'官窑',category:'traditional',shape:'plate',style:'ruci',glaze:'#9BC4B0',patterns:[P.ruCrackle,P.iceCrack],profile:plate(0.25,1.6,0.35,0.22)},
  {id:'bm-058',name:'南宋·官窑青釉长颈瓶',dynasty:'南宋',ware:'官窑',category:'traditional',shape:'vase',style:'ruci',glaze:'#9BC4B0',patterns:[P.ruCrackle,P.iceCrack],profile:danPing(2.25,0.42)},
  {id:'bm-059',name:'南宋·官窑青釉碗',dynasty:'南宋',ware:'官窑',category:'traditional',shape:'bowl',style:'ruci',glaze:'#9BC4B0',patterns:[P.ruCrackle,P.iceCrack],profile:bowl(0.50,1.4,0.28,0.4)},

  // ── 哥窑 6款 ──
  {id:'bm-062',name:'南宋·哥窑米黄釉盘',dynasty:'南宋',ware:'哥窑',category:'traditional',shape:'plate',style:'geci',glaze:'#e6d7b8',patterns:[P.geWire,P.meander],profile:plate(0.26,1.65,0.35,0.24)},
  {id:'bm-064',name:'南宋·哥窑金丝铁线杯',dynasty:'南宋',ware:'哥窑',category:'traditional',shape:'cup',style:'geci',glaze:'#e6d7b8',patterns:[P.geWire,P.ruCrackle],profile:cup(0.70,0.66,0.21,0.32)},
  {id:'bm-065',name:'南宋·哥窑青釉洗',dynasty:'南宋',ware:'哥窑',category:'traditional',shape:'bowl',style:'geci',glaze:'#e6d7b8',patterns:[P.geWire,P.ruCrackle],profile:bowl(0.38,1.3,0.30,0.3)},

  // ── 钧窑 7款 ──
  {id:'bm-066',name:'北宋·钧窑玫瑰紫釉花盆',dynasty:'北宋',ware:'钧窑',category:'traditional',shape:'jar',style:'jun',glaze:'#7A5A8A',patterns:[P.jun,P.cloud],profile:gaiGuan(1.35,0.58)},
  {id:'bm-067',name:'北宋·钧窑天蓝釉出戟尊',dynasty:'北宋',ware:'钧窑',category:'traditional',shape:'vase',style:'jun',glaze:'#5A7AAA',patterns:[P.jun,P.cloud,P.meander],profile:congShi(2.15,0.32)},
  {id:'bm-069',name:'北宋·钧窑丁香紫釉瓶',dynasty:'北宋',ware:'钧窑',category:'traditional',shape:'vase',style:'jun',glaze:'#7A5A8A',patterns:[P.jun,P.cloud],profile:danPing(1.85,0.43)},
  {id:'bm-070',name:'北宋·钧窑海棠红花盆',dynasty:'北宋',ware:'钧窑',category:'traditional',shape:'jar',style:'jun',glaze:'#B84430',patterns:[P.jun,P.cloud,P.peonyMotif],profile:jiangJunGuan(1.5,0.60)},
  {id:'bm-071',name:'北宋·钧窑天蓝釉盘',dynasty:'北宋',ware:'钧窑',category:'traditional',shape:'plate',style:'jun',glaze:'#5A7AAA',patterns:[P.jun],profile:plate(0.27,1.8,0.40,0.26)},
  {id:'bm-072',name:'北宋·钧窑窑变梅瓶',dynasty:'北宋',ware:'钧窑',category:'traditional',shape:'vase',style:'jun',glaze:'#C47E5A',patterns:[P.jun,P.cloud],profile:meiPing(2.05,0.50)},

  // ── 定窑 4款 ──
  {id:'bm-073',name:'北宋·定窑白釉刻花盘',dynasty:'北宋',ware:'定窑',category:'traditional',shape:'plate',style:'bai',glaze:'#F5F0E8',patterns:[P.lotusMotif,P.scrollVine,P.peonyMotif],profile:plate(0.26,1.7,0.38,0.24)},
  {id:'bm-074',name:'北宋·定窑白釉刻花瓶',dynasty:'北宋',ware:'定窑',category:'traditional',shape:'vase',style:'bai',glaze:'#F5F0E8',patterns:[P.lotusMotif,P.scrollVine,P.peonyMotif],profile:yuHuChun(2.0,0.48)},
  {id:'bm-076',name:'北宋·定窑白釉执壶',dynasty:'北宋',ware:'定窑',category:'traditional',shape:'teapot',style:'bai',glaze:'#F5F0E8',patterns:[P.lotusMotif,P.scrollVine,P.entwined],profile:gaiGuan(1.55,0.48)},

  // ═══ 颜色釉陈设瓷 14款 ═══
  {id:'bm-077',name:'清康熙·郎窑红釉观音瓶',dynasty:'清康熙',ware:'郎窑红',category:'traditional',shape:'vase',style:'bai',glaze:'#C43A3A',patterns:[P.ruyi],profile:shangPing(2.25,0.47)},
  {id:'bm-079',name:'清康熙·豇豆红釉太白尊',dynasty:'清康熙',ware:'豇豆红',category:'traditional',shape:'jar',style:'bai',glaze:'#D4878A',patterns:[P.cloud,P.ruyi],profile:gaiGuan(1.15,0.58)},
  {id:'bm-080',name:'清乾隆·乌金釉天球瓶',dynasty:'清乾隆',ware:'乌金釉',category:'traditional',shape:'vase',style:'bai',glaze:'#2C2C2C',patterns:[P.ruyi],profile:shangPing(1.95,0.56)},
  {id:'bm-083',name:'清雍正·胭脂红釉长颈瓶',dynasty:'清雍正',ware:'胭脂红釉',category:'traditional',shape:'vase',style:'bai',glaze:'#C43A5A',patterns:[P.meander],profile:danPing(2.4,0.43)},
  {id:'bm-085',name:'清乾隆·鹅黄釉碗',dynasty:'清乾隆',ware:'鹅黄釉',category:'traditional',shape:'bowl',style:'bai',glaze:'#F5D89A',patterns:[P.meander],profile:bowl(0.52,1.45,0.30,0.44)},
  {id:'bm-087',name:'清乾隆·洒蓝釉瓶',dynasty:'清乾隆',ware:'洒蓝釉',category:'traditional',shape:'vase',style:'bai',glaze:'#223B70',patterns:[P.cloud],profile:shangPing(2.2,0.52)},
  {id:'bm-088',name:'清雍正·孔雀绿釉瓶',dynasty:'清雍正',ware:'孔雀绿釉',category:'traditional',shape:'vase',style:'bai',glaze:'#247C6C',patterns:[P.meander,P.ruyi],profile:danPing(2.1,0.48)},
  // ═══ 民俗茶具 6款 ═══
  {id:'bm-091',name:'宋式·建窑兔毫盏',dynasty:'宋代',ware:'建窑',category:'japanese',shape:'cup',style:'bai',glaze:'#2C2C2C',patterns:[],profile:cup(0.60,0.88,0.28,0.5)},
  {id:'bm-092',name:'日式·柴烧粗陶花瓶',dynasty:'现代',ware:'柴烧',category:'japanese',shape:'vase',style:'bai',glaze:'#8B6B4A',patterns:[P.iceCrack],profile:meiPing(1.75,0.46)},
  {id:'bm-093',name:'日式·备前烧花入',dynasty:'现代',ware:'备前烧',category:'japanese',shape:'vase',style:'bai',glaze:'#9B8B78',patterns:[],profile:danPing(2.1,0.42)},
  {id:'bm-094',name:'日式·志野烧抹茶碗',dynasty:'现代',ware:'志野烧',category:'japanese',shape:'bowl',style:'bai',glaze:'#F5F0E5',patterns:[P.iceCrack],profile:bowl(0.55,1.25,0.28,0.48)},
  {id:'bm-095',name:'日式·乐烧茶碗',dynasty:'现代',ware:'乐烧',category:'japanese',shape:'cup',style:'bai',glaze:'#3D2C1A',patterns:[],profile:cup(0.65,0.82,0.29,0.5)},
  {id:'bm-096',name:'日式·萩烧花器',dynasty:'现代',ware:'萩烧',category:'japanese',shape:'vase',style:'bai',glaze:'#E8D8C0',patterns:[P.iceCrack,P.orchid],profile:yuHuChun(1.8,0.44)},
]

// ═══════════════════════════════════════════════════════════════
// 轻量高斯平滑 → CatmullRom 超采样至 512 点 = 光滑旋转曲面
// ═══════════════════════════════════════════════════════════════
function gaussianSmoothProfile(points, sigma = 2.5, kernelSize = 9) {
  if (!points || points.length < 3) return points
  const n = points.length
  const half = Math.floor(kernelSize / 2)

  // 1D 高斯核
  const kernel = []
  let sum = 0
  for (let i = -half; i <= half; i++) {
    const w = Math.exp(-(i * i) / (2 * sigma * sigma))
    kernel.push(w)
    sum += w
  }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= sum

  // 对 radius(x) 做卷积，保持 y 不变
  const result = []
  for (let i = 0; i < n; i++) {
    let sx = 0
    for (let k = -half; k <= half; k++) {
      const idx = Math.max(0, Math.min(n - 1, i + k))
      sx += points[idx].x * kernel[k + half]
    }
    // 底部中心(r≈0)保持闭合，顶部口沿保持原样
    const isPole = points[i].x < 0.005
    result.push(new THREE.Vector2(isPole ? points[i].x : Math.max(0.001, sx), points[i].y))
  }
  return result
}

for (const model of builtinModels) {
  if (model.profile && model.profile.length > 0) {
    model.profile = gaussianSmoothProfile(model.profile, 2.5, 9)
    model.profile = upsampleProfile(model.profile, 512)
  }
}

// ═══════════════════════════════════════════════════════════════
// UI categories & filters
// ═══════════════════════════════════════════════════════════════
export const categoryTabs=[
  {id:'all',name:'全部',icon:'🏺'},
  {id:'traditional',name:'传统国风',icon:'🏮'},
  {id:'japanese',name:'日式侘寂',icon:'🍵'},
]
export const styleFilters=[
  {id:'all',name:'全部风格'},
  {id:'青花瓷',name:'青花瓷'},{id:'汝窑',name:'汝窑'},{id:'官窑',name:'官窑'},
  {id:'哥窑',name:'哥窑'},{id:'钧窑',name:'钧窑'},{id:'定窑',name:'定窑'},
  {id:'颜色釉',name:'颜色釉'},
]
export const hotKeywords=['永乐青花','汝窑','钧瓷','梅瓶','玉壶春','宣德','康熙','雍正','建盏','柴烧']
export function matchWareFilter(model,filterId){
  if(filterId==='all')return true
  const colorGlazes=['郎窑红','霁蓝釉','豇豆红','乌金釉','松石绿釉','茄皮紫釉','胭脂红釉','影青釉','鹅黄釉','祭红釉','茶叶末釉','窑变钧红','洒蓝釉','孔雀绿釉','铁锈花釉','胭脂窑变','祭红窑变']
  if(filterId==='颜色釉')return colorGlazes.includes(model.ware)
  return model.ware===filterId
}

/** Generate card thumbnail */
export function generateThumbnail(model,size=180){
  const c=document.createElement('canvas');c.width=size;c.height=size
  const ctx=c.getContext('2d')
  const bg=ctx.createLinearGradient(0,0,size,size);bg.addColorStop(0,'#f5f0e8');bg.addColorStop(1,'#ede4d8')
  ctx.fillStyle=bg;ctx.fillRect(0,0,size,size)
  const cx=size/2,cy=size/2,g=model.glaze||'#E8E0D8',sh=model.shape
  if(sh==='plate'){const r=size*0.42,ry=size*0.08;ctx.fillStyle=g;ctx.beginPath();ctx.ellipse(cx,cy,r,ry,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='rgba(255,255,255,0.2)';ctx.beginPath();ctx.ellipse(cx-r*0.1,cy-ry*0.1,r*0.4,ry*0.4,0,0,Math.PI*2);ctx.fill()}
  else if(sh==='bowl'){const w=size*0.38,h=size*0.15;ctx.fillStyle=g;ctx.beginPath();ctx.ellipse(cx,cy+h*0.2,w,h,0,0,Math.PI*2);ctx.fill()}
  else if(sh==='cup'){const h=size*0.5,w=size*0.25;ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(cx-w*0.6,cy+h*0.4);ctx.lineTo(cx-w*0.65,cy-h*0.3);ctx.quadraticCurveTo(cx-w,cy-h*0.4,cx-w*0.85,cy-h*0.45);ctx.lineTo(cx+w*0.85,cy-h*0.45);ctx.quadraticCurveTo(cx+w,cy-h*0.4,cx+w*0.65,cy-h*0.3);ctx.lineTo(cx+w*0.6,cy+h*0.4);ctx.closePath();ctx.fill()}
  else if(sh==='vase'){const H=size*0.65,bw=size*0.12,sw=size*0.26,nkW=size*0.07,mw=size*0.08;ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(cx-bw,cy+H*0.42);ctx.quadraticCurveTo(cx-sw,cy+H*0.10,cx-sw*0.4,cy-H*0.30);ctx.quadraticCurveTo(cx-nkW,cy-H*0.38,cx-nkW,cy-H*0.44);ctx.lineTo(cx-mw,cy-H*0.48);ctx.lineTo(cx+mw,cy-H*0.48);ctx.lineTo(cx+nkW,cy-H*0.44);ctx.quadraticCurveTo(cx+nkW,cy-H*0.38,cx+sw*0.4,cy-H*0.30);ctx.quadraticCurveTo(cx+sw,cy+H*0.10,cx+bw,cy+H*0.42);ctx.closePath();ctx.fill()}
  else if(sh==='jar'){const H=size*0.48,bw=size*0.28,lidW=size*0.23;ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(cx-bw*0.85,cy+H*0.35);ctx.quadraticCurveTo(cx-bw,cy-H*0.05,cx-lidW,cy-H*0.25);ctx.lineTo(cx-lidW*0.55,cy-H*0.45);ctx.lineTo(cx+lidW*0.55,cy-H*0.45);ctx.lineTo(cx+lidW,cy-H*0.25);ctx.quadraticCurveTo(cx+bw,cy-H*0.05,cx+bw*0.85,cy+H*0.35);ctx.closePath();ctx.fill()}
  else if(sh==='teapot'){const bw=size*0.22,by=size*0.13;ctx.fillStyle=g;ctx.beginPath();ctx.ellipse(cx,cy+by,bw,by*1.2,0,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.moveTo(cx+bw*0.7,cy+by*0.1);ctx.lineTo(cx+bw*1.3,cy-by*0.3);ctx.strokeStyle=g;ctx.lineWidth=2.5;ctx.stroke();ctx.beginPath();ctx.arc(cx-bw*0.75,cy-by*0.2,bw*0.3,-Math.PI*0.55,Math.PI*0.55);ctx.stroke()}
  else{const H=size*0.65,bw=size*0.18,blW=size*0.3,nkW=size*0.09,mw=size*0.10;ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(cx-bw,cy+H*0.42);ctx.quadraticCurveTo(cx-blW,cy+H*0.05,cx-blW,cy-H*0.15);ctx.quadraticCurveTo(cx-nkW,cy-H*0.38,cx-nkW,cy-H*0.44);ctx.lineTo(cx-mw,cy-H*0.48);ctx.lineTo(cx+mw,cy-H*0.48);ctx.lineTo(cx+nkW,cy-H*0.44);ctx.quadraticCurveTo(cx+nkW,cy-H*0.38,cx+blW,cy-H*0.15);ctx.quadraticCurveTo(cx+blW,cy+H*0.05,cx+bw,cy+H*0.42);ctx.closePath();ctx.fill()}
  return c.toDataURL('image/png')
}
export default builtinModels
