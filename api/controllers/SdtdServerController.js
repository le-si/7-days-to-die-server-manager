/**
 * SdtdServerController
 *
 * @description :: Server-side logic for managing sdtdservers
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */

var sevenDays = require('machinepack-7daystodiewebapi');

module.exports = {

    addServer: async function(req, res) {
        if (_.isUndefined(req.param('serverip'))) {
            return res.badRequest('A server IP is required but was not given');
        }
        if (_.isUndefined(req.param('telnetport'))) {
            return res.badRequest('A telnet port is required but was not given');
        }
        if (_.isUndefined(req.param('telnetpassword'))) {
            return res.badRequest('A telnet password is required but was not given');
        }
        if (_.isUndefined(req.param('webport'))) {
            return res.badRequest('A web port is required but was not given');
        }

        const serverip = req.param('serverip');
        const telnetport = req.param('telnetport');
        const telnetpassword = req.param('telnetpassword');
        const webport = req.param('webport');

        SdtdServer.find({
            ip: serverip,
            telnetPort: telnetport,
            webPort: webport,
        }).exec(function(err, foundServers) {
            if (err) {
                return res.serverError(new Error("Error checking for existing server"));
            }
            if (!_.isUndefined(foundServers) && foundServers.length > 0) {
                sails.log.warn(`User tried to add a server that is already in the system`);
                return res.badRequest(`This server has already been added to the system`);
            }

            sails.helpers.createWebToken({
                ip: serverip,
                port: telnetport,
                password: telnetpassword
            }).switch({
                success: async function(authInfo) {
                    sails.log.debug('Successfully connected to telnet & created tokens');
                    var createdServer = await SdtdServer.create({
                        ip: serverip,
                        telnetPort: telnetport,
                        telnetPassword: telnetpassword,
                        webPort: webport,
                        authName: authInfo.authName,
                        authToken: authInfo.authToken,
                        owner: req.signedCookies.userProfile.id
                    }).fetch();
                    await sails.hooks.sdtdlogs.start(createdServer.id);
                    return res.json(createdServer);

                },
                error: function(error) {
                    sails.log.warn('Could not connect to servers telnet ' + error);
                    res.badRequest('Could not connect to the servers telnet');
                }
            });
        });



    },

    dashboard: async function(req, res) {
        const serverID = req.param('serverID');
        sails.models.sdtdserver.findOne({ id: serverID }).exec(function(error, server) {
            if (error) {
                sails.log.error(error);
                throw error;
            }
            sevenDays.getOnlinePlayers({
                ip: server.ip,
                port: server.webPort,
                authName: server.authName,
                authToken: server.authToken
            }).exec({
                error: function(error) {
                    return res.badRequest(new Error("Could not connect to your server.\n" + error));
                },
                success: function(result) {
                    res.view('sdtdServer/dashboard', {
                        server: server,
                        onlinePlayers: result
                    });
                }
            });

        });
    },

    console: function(req, res) {
        const serverID = req.param('serverID');
        if (_.isUndefined(serverID)) {
            return res.badRequest("No serverID given");
        }
        sails.models.sdtdserver.findOne({ id: serverID }).exec(function(error, server) {
            if (error) {
                return res.badRequest("Unknown server");
            } else {
                return res.view('sdtdServer/console', { server: server });
            }
        });
    },

    executeCommand: function(req, res) {
        const serverID = req.param('serverID');
        const command = req.param('command');
        if (_.isUndefined(serverID)) {
            return res.badRequest("No serverID given");
        }
        if (_.isUndefined(command)) {
            return res.badRequest("No command given");
        }
        sails.models.sdtdserver.findOne({ id: serverID }).exec(function(error, server) {
            if (error) {
                return res.badRequest("Unknown server");
            } else {
                sails.log.debug(`User ${req.session.userId} executed a command on server ${server.id} ${command}`);
                sevenDays.executeCommand({
                    ip: server.ip,
                    port: server.webPort,
                    authName: server.authName,
                    authToken: server.authToken,
                    command: command
                }).exec({
                    error: function(error) {
                        return res.badRequest(new Error('Error executing command\n' + error));
                    },
                    success: function(response) {
                        let logLine = {
                            msg: response.result,
                            date: new Date(),
                            type: 'commandResponse'
                        };
                        sails.sockets.broadcast(server.id, 'logLine', logLine);
                        return res.json(logLine);
                    }
                });
            }
        });

    },

    startLogging: async function(req, res) {
        const serverID = req.param('serverID');
        sails.log.info(`Starting logging for ${serverID}`);
        try {
            sails.hooks.sdtdlogs.start(serverID);
        } catch (error) {
            res.serverError(error);
        }
    },

    stopLogging: async function(req, res) {
        const serverID = req.param('serverID');
        sails.log.info(`Stopping logging for ${serverID}`);
        try {
            sails.hooks.sdtdlogs.stop(serverID);
        } catch (error) {
            res.serverError(error);
        }
    },

    subscribeToServerSocket: function(req, res) {
        const serverID = req.param('serverID');
        sails.log.debug(`Connecting user with id ${req.session.userId} to server socket with id ${serverID}`)
        if (_.isUndefined(serverID)) {
            return res.badRequest("No server ID given.");
        }
        if (!req.isSocket) {
            return res.badRequest();
        }
        sails.models.sdtdserver.findOne({ id: serverID }).exec(function(error, server) {
            if (error) {
                return res.badRequest("Unknown server");
            } else {
                sails.log.debug(`Successfully connected`);
                sails.sockets.join(req, serverID);
                return res.ok();
            }

        });
    },

    loadServerInfo: function(req, res) {
        const serverId = req.param('serverID');
        sails.log.debug(`Updating server info for ${serverId}`);
        if (_.isUndefined(serverId)) {
            return res.badRequest("No server ID given.");
        }
        sails.helpers.loadServerInfo({
            serverId: serverId
        }).exec({
            success: function() {
                return res.ok();
            },
            connectionError: function(error) {
                return res.badRequest(new Error('Could not connect to server'));
            },
            databaseError: function(error) {
                return res.serverError(new Error('Database error'));
            }
        });
    },

    // _____  ______  _____ _______            _____ _____ 
    // |  __ \|  ____|/ ____|__   __|     /\   |  __ \_   _|
    // | |__) | |__  | (___    | |       /  \  | |__) || |  
    // |  _  /|  __|  \___ \   | |      / /\ \ |  ___/ | |  
    // | | \ \| |____ ____) |  | |     / ____ \| |    _| |_ 
    // |_|  \_\______|_____/   |_|    /_/    \_\_|   |_____|

    onlinePlayers: function(req, res) {
        const serverID = req.query.serverId;

        sails.log.debug(`Showing online players for ${serverID}`);

        if (_.isUndefined(serverID)) {
            return res.badRequest("No server ID given");
        } else {
            sails.models.sdtdserver.findOne({ id: serverID }).exec(function(error, server) {
                if (error) {
                    sails.log.error(error);
                    res.serverError(error);
                }
                sevenDays.getOnlinePlayers({
                    ip: server.ip,
                    port: server.webPort,
                    authName: server.authName,
                    authToken: server.authToken,
                }).exec({
                    error: function(error) {
                        return res.serverError(error);
                    },
                    connectionRefused: function(error) {
                        return res.badRequest(error);
                    },
                    unauthorized: function(error) {
                        return res.badRequest(error);
                    },
                    success: function(data) {
                        return res.status(200).json(data)
                    }
                });
            });
        }
    },

    getPlayers: function(req, res) {
        const serverId = req.query.serverId;
        if (_.isUndefined(serverId)) {
            return res.badRequest("No server ID given.");
        }
        sails.log.debug(`Showing all players for ${serverId}`);

        SdtdServer.findOne({ id: serverId }).exec(function(err, server) {
            if (err) { return res.serverError(new Error(`Database error`)); }
            sevenDays.getPlayerList({
                ip: server.ip,
                port: server.webPort,
                authName: server.authName,
                authToken: server.authToken,
            }).exec({
                error: function(error) {
                    return res.serverError(error);
                },
                connectionRefused: function(error) {
                    return res.badRequest(error);
                },
                unauthorized: function(error) {
                    return res.badRequest(error);
                },
                success: function(data) {
                    return res.status(200).json(data.players)
                }
            });
        });

    },

    getServerInfo: function(req, res) {
        const serverId = req.query.serverId;
        if (_.isUndefined(serverId)) {
            return res.badRequest("No server ID given.");
        }
        sails.log.debug(`Showing server info for ${serverId}`);
        SdtdServer.findOne({ id: serverId }).exec(function(err, foundServer) {
            if (err) { return res.serverError(new Error(`Database error`)); }
            return res.json(foundServer);
        });

    },


};