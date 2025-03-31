const fs = require('fs').promises;
const path = require('path');

/**
 * @param {string} id 
 * @param {string} command 
 * @param {string} [dirPath='./data'] 
 * @returns {Promise<string|null>}
 */

async function getCommandResponse(id, command, dirPath = './data') {
  try {
    const cleanId = id.replace(/@g\.us$/, '').replace('@s.whatsapp.net', '');
    const filePath = path.join(dirPath, `${cleanId}.json`);
    
    const data = await fs.readFile(filePath, 'utf8');
    const commands = JSON.parse(data);

    // Pega apenas a primeira correspondência
    const foundCommand = commands.find(cmd => cmd.comando === command);
    
    return foundCommand || null;
    
  } catch (err) {
    if (err.code === 'ENOENT') {
      return null;
    }
    return null;
  }
}
