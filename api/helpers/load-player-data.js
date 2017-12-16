var sevenDays = require('machinepack-7daystodiewebapi');

module.exports = {
  friendlyName: 'Load player data',
  description: 'Load player information from a 7 Days to die server',
  inputs: {
    serverId: {
      type: 'number',
      required: true
    },
    steamId: {
      type: 'string'
    },
    playerId: {
      type: 'number'
    }
  },
  exits: {
    error: {
      friendlyName: 'error'
    }
  },
  fn: async function (inputs, exits) {
    sails.log.debug(`HELPER LOAD PLAYER DATA Loading player data for server ${inputs.serverId}`);

    try {
      let server = await SdtdServer.findOne(inputs.serverId)
      let playerList = await getPlayerList(server)
      let newPlayerList = await playerList.players.map(await updatePlayerInfo)
      let jsonToSend = await createJSON(newPlayerList)
      exits.success(jsonToSend)
    } catch (error) {
      exits.error(error)
    }


    async function updatePlayerInfo(newPlayer) {
      return new Promise(async function(resolve) {
        try {
          foundOrCreatedPlayer = await Player.findOrCreate({
            steamId: newPlayer.steamid,
            server: inputs.serverId,
            entityId: newPlayer.entityid
          }, {
            steamId: newPlayer.steamid,
            server: inputs.serverId,
            entityId: newPlayer.entityid,
            name: newPlayer.name,
            ip: newPlayer.ip
          })
          newPlayer = await Player.update({
            steamId: foundOrCreatedPlayer.steamId,
            server: inputs.serverId,
            entityId: foundOrCreatedPlayer.entityId
          }).set({
            ip: newPlayer.ip,
            positionX: newPlayer.position.x,
            positionY: newPlayer.position.y,
            positionZ: newPlayer.position.z,
            playtime: newPlayer.totalplaytime,
            banned: newPlayer.banned
          }).fetch()
          resolve(newPlayer[0])
        } catch (error) {
          throw error
        }

      })
    }

    async function getPlayerList(server) {
      return new Promise(resolve => {
        sevenDays.getPlayerList({
          ip: server.ip,
          port: server.webPort,
          authName: server.authName,
          authToken: server.authToken
        }).exec({
          error: function (err) {
            throw err
          },
          success: function (playerList) {
            resolve(playerList)
          }
        });
      })
    }


    async function createJSON(playerList) {
      return new Promise(async function(resolve) {
        try {
          let toSend = {};
          Promise.all(playerList).then(resolvedPlayers => {
            toSend.totalPlayers = playerList.length
            toSend.players = new Array();
            resolvedPlayers.forEach(function(player) {
              let playerData = new Object()
              playerData.id = player.id
              playerData.steamId = player.steamId
              playerData.entityId = player.entityId
              playerData.location = new Object()
              playerData.location.x = player.positionX
              playerData.location.y = player.positionY
              playerData.location.z = player.positionZ
              playerData.totalPlaytime = player.playtime
              playerData.banned = player.banned
              playerData.server = player.server
              toSend.players.push(playerData)
            })
            resolve(toSend)
          })
          
        } catch (error) {
          throw error
        }
      })
    }
  },
}
