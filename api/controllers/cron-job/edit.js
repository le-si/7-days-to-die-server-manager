module.exports = {


  friendlyName: 'Edit',


  description: 'Edit cron job.',


  inputs: {
    jobId: {
      required: true,
      type: 'string'
    },

    command: {
      required: true,
      type: 'string'
    },

    temporalValue: {
      required: true,
      type: 'string',
      custom: function (valueToCheck) {
        const cronParser = require('cron-parser');

        const interval = cronParser.parseExpression(valueToCheck);

        let prevDate = interval.prev().toDate();
        let nextDate = interval.next().toDate();

        return (prevDate.valueOf() + 300000) < nextDate.valueOf()

      }
    }
  },


  exits: {

  },


  fn: async function (inputs, exits) {

    await CronJob.update({
      id: inputs.jobId
    }, {
      command: inputs.command,
      temporalValue: inputs.temporalValue
    });

    sails.log.info(`Edited a cron job with id ${inputs.jobId} to ${inputs.command} and ${inputs.temporalValue}`);
    return exits.success();

  }


};
