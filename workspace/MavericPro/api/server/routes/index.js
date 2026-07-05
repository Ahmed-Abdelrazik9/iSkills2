const accessPermissions = require('./accessPermissions');
const assistants = require('./assistants');
const categories = require('./categories');
const tokenizer = require('./tokenizer');
const endpoints = require('./endpoints');
const staticRoute = require('./static');
const messages = require('./messages');
const memories = require('./memories');
const presets = require('./presets');
const prompts = require('./prompts');
const balance = require('./balance');
const plugins = require('./plugins');
const actions = require('./actions');
const banner = require('./banner');
const search = require('./search');
const models = require('./models');
const convos = require('./convos');
const config = require('./config');
const agents = require('./agents');
const roles = require('./roles');
const oauth = require('./oauth');
const files = require('./files');
const share = require('./share');
const tags = require('./tags');
const auth = require('./auth');
const edit = require('./edit');
const keys = require('./keys');
const user = require('./user');
const admin = require('./admin');
const mcp = require('./mcp');
const translate = require('./translate');
const brief = require('./brief');
const pollinations = require('./pollinations');
const invitations = require('./invitations');
const diagnostics = require('./diagnostics');
const maveric = require('./maveric');
const powerpoint = require('./powerpoint');
const artifacts = require('./artifacts');

const studio = require('./studio');
const webIntel = require('./webIntel');
const fusion = require('./fusion');
const history = require('./history');
const notes = require('./notes');
const searchIntelligence = require('./searchIntelligence');
const modelSync = require('./model-sync');
const gallery = require('./gallery');
const vault = require('./vault');
const wsBridge = require('./wsBridge');
const ddgBridge = require('./ddgBridge');
const deepResearch = require('./deepResearch');
const imed = require('./imed');
const ianatomy = require('./ianatomy');
const openrouterRankings = require('./openrouterRankings');
const userProjects = require('./userProjects');
const neuralSync = require('./neuralSync');

module.exports = {
  openrouterRankings,
  userProjects,
  neuralSync,
  maveric,
  searchIntelligence,
  history,
  notes,
  fusion,
  webIntel,
  mcp,
  edit,
  auth,
  keys,
  user,
  admin,
  tags,
  roles,
  oauth,
  files,
  share,
  banner,
  agents,
  convos,
  search,
  config,
  models,
  prompts,
  plugins,
  actions,
  presets,
  balance,
  messages,
  memories,
  endpoints,
  tokenizer,
  assistants,
  categories,
  staticRoute,
  accessPermissions,
  translate,
  brief,
  pollinations,
  invitations,
  diagnostics,
  powerpoint,

  studio,
  googleWebSearch: require('./googleWebSearch'),
  modelSync,
  gallery,
  vault,
  wsBridge,
  ddgBridge,
  enhance: require('./enhance'),
  deepResearch,
  duckDuckGoWebSearch: require('./duckDuckGoWebSearch'),
  mavericGemini: require('./maveric/gemini'),
  mavericQwen: require('./maveric/qwen'),
  mavericFireRed: require('./maveric/fire-red'),
  mavericIStudy2: require('./maveric/istudy2'),
  mavericIExam: require('./maveric/iexam'),
  mavericIThink: require('./maveric/ithink'),
  mavericGraph: require('./maveric/graph'),
  mavericPdf: require('./maveric/pdf'),
  artifacts,
  irota: require('./maveric/irota'),
  ireminder: require('./maveric/ireminder'),
  imed,
  ispace: require('./ispace'),
  iclinic: require('./iclinic'),
  isketch: require('./isketch'),
  illustrate: require('./illustrate'),
  ianatomy,
  // mavericITrade: require('./maveric/itrade'),

  mavericAuth: require('./oauth/google'),
  inexus: require('./inexus').router,
};
