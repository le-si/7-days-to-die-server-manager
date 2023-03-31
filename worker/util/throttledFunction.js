const EventEmitter = require('events');
/**
 * Executes a function no more than amount times per minutes with sliding window
 * @param {Function} listener
 * @param {Number} amount
 */
class ThrottledFunction extends EventEmitter {
  constructor(listener, amount, minutes) {
    super();
    this.amount = amount;
    this.minutes = minutes;
    this.buckets = {};
    this.lastState = 'normal';
    this.listener = (data) => {
      this.incrBucket();
      const sum = Object.values(this.buckets).reduce((sum, amount) => sum + amount, 0);
      if (sum > this.amount) {
        sails.log.warn(`Discarding an event`, { labels: { namespace: 'throttledFunction' }, bucket: this.buckets, event: data });

        if (this.lastState === 'normal') {
          this.emit('throttled', { buckets: this.buckets });
          this.lastState = 'throttled';
          this.createInactivityTimeout();
        }

        return;
      }

      if (this.lastState === 'throttled') {
        this.emit('normal', { buckets: this.buckets });
        this.lastState = 'normal';
      }
      listener(data);
    };

    // The function can return to normal state even when it's not called
    this.inactivityTimeout;
  }

  createInactivityTimeout() {
    if (this.inactivityTimeout) { clearTimeout(this.inactivityTimeout); };
    this.inactivityTimeout = setTimeout(() => {
      this.refreshBuckets();
      const sum = Object.values(this.buckets).reduce((sum, amount) => sum + amount, 0);
      if (sum === 0 && this.lastState === 'throttled') {
        sails.log.debug('Throttled function is now normal after some inactivity', { labels: { namespace: 'throttledFunction' } });
        this.emit('normal', { buckets: this.buckets });
        this.lastState = 'normal';
      }
    }, this.minutes * 60 * 1000);
  }

  incrBucket() {
    const date = new Date();
    date.setUTCMilliseconds(0);
    date.setUTCSeconds(0);

    if (!this.buckets[date.toISOString()]) {
      this.buckets[date.toISOString()] = 0;
      this.refreshBuckets();
    }

    this.buckets[date.toISOString()]++;
  }

  refreshBuckets() {
    const date = new Date();
    date.setUTCMilliseconds(0);
    date.setUTCSeconds(0);
    const keys = Object.keys(this.buckets);

    keys
      .filter(d => {
        return new Date(d) < date.getTime() - this.minutes * 60 * 1000;
      })
      .forEach(keyToDelete => {
        delete this.buckets[keyToDelete];
      });
  }
}


module.exports = ThrottledFunction;
