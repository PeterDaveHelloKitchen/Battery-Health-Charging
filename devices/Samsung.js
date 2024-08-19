'use strict';
/* Samsung Laptops */
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import * as Helper from '../lib/helper.js';

const {exitCode, fileExists, readFileInt, runCommandCtl} = Helper;

const SAMSUNG_PATH = '/sys/devices/platform/samsung/battery_life_extender';

export const SamsungSingleBattery = GObject.registerClass({
    Signals: {'threshold-applied': {param_types: [GObject.TYPE_STRING]}},
}, class SamsungSingleBattery extends GObject.Object {
    constructor(settings) {
        super();
        this.name = 'Samsung';
        this.type = 6;
        this.deviceNeedRootPermission = true;
        this.deviceHaveDualBattery = false;
        this.deviceHaveStartThreshold = false;
        this.deviceHaveVariableThreshold = false;
        this.deviceHaveBalancedMode = false;
        this.deviceHaveAdaptiveMode = false;
        this.deviceHaveExpressMode = false;
        this.deviceUsesModeNotValue = true;

        this._settings = settings;
        this.ctlPath = null;
    }

    isAvailable() {
        if (!fileExists(SAMSUNG_PATH))
            return false;
        this._settings.set_int('icon-style-type', 0);
        return true;
    }

    async setThresholdLimit(chargingMode) {
        this._chargingMode = chargingMode;
        if (this._chargingMode === 'ful')
            this._batteryLifeExtender = 0;
        else if (this._chargingMode === 'max')
            this._batteryLifeExtender = 1;

        if (this._verifyThreshold())
            return exitCode.SUCCESS;

        const [status] = await runCommandCtl(this.ctlPath, 'SAMSUNG', `${this._batteryLifeExtender}`, null, null);
        if (status === exitCode.ERROR) {
            this.emit('threshold-applied', 'failed');
            return exitCode.ERROR;
        }

        if (this._verifyThreshold())
            return exitCode.SUCCESS;

        if (this._delayReadTimeoutId)
            GLib.source_remove(this._delayReadTimeoutId);
        this._delayReadTimeoutId = null;

        await new Promise(resolve => {
            this._delayReadTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {
                resolve();
                return GLib.SOURCE_REMOVE;
            });
        });

        if (this._verifyThreshold())
            return exitCode.SUCCESS;

        this.emit('threshold-applied', 'failed');
        return exitCode.ERROR;
    }

    _verifyThreshold() {
        if (readFileInt(SAMSUNG_PATH) === this._batteryLifeExtender) {
            this.mode = this._chargingMode;
            this.emit('threshold-applied', 'success');
            return true;
        }
        return false;
    }

    destroy() {
        if (this._delayReadTimeoutId)
            GLib.source_remove(this._delayReadTimeoutId);
        this._delayReadTimeoutId = null;
    }
});

