const { MasterIPC, IPCEvents } = require('kurasuta');

module.exports = class AzumaIPC extends MasterIPC {
    _incommingMessage(message) {
        const event = IPCEvents[message.data.op]?.toLowerCase();
        if (!event) return;
        this[`_${event}`](message);
    }
}