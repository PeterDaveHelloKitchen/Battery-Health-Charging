'use strict';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Config from 'resource:///org/gnome/shell/misc/config.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

const NotificationDestroyedReason = MessageTray.NotificationDestroyedReason;
const Urgency = MessageTray.Urgency;

const [major] = Config.PACKAGE_VERSION.split('.');
const shellVersion45 = Number.parseInt(major) < 46;

export class Notify {
    constructor(settings, extensionObject) {
        this._settings = settings;
        this._uuid = extensionObject.uuid;
        this._name = _('Battery Health Charging');
        this._iconFolder = `${extensionObject.path}/icons/hicolor/scalable/actions/`;
        this.firstThresholdExecCompleted = false;
        this._showNotifications = this._settings.get_boolean('show-notifications');
        this._settings.connectObject('changed::show-notifications', () => {
            this._showNotifications = this._settings.get_boolean('show-notifications');
        }, this);
    }

    _getIcon(iconName) {
        return Gio.icon_new_for_string(`${this._iconFolder}/${iconName}.svg`);
    }

    _notify(msg, action) {
        let notifyIcon = 'battery-level-100-charged-symbolic';
        let notifyTitle = shellVersion45 ? this._name : _('Mode updated');
        let urgency = Urgency.NORMAL;

        if (action === 'error' || action === 'show-settings' || action === 'show-details') {
            urgency = Urgency.CRITICAL;
            notifyTitle = _('Battery Health Charging Error');
            notifyIcon = 'dialog-warning-symbolic';
        }

        if (shellVersion45)
            this._source = new MessageTray.Source(this._name, notifyIcon);
        else
            this._source = new MessageTray.Source({title: this._name, icon: this._getIcon('bhc-qs-sym-bal-symbolic')});

        Main.messageTray.add(this._source);

        if (this._notification)
            this._notification.destroy(NotificationDestroyedReason.REPLACED);

        if (shellVersion45) {
            this._notification = new MessageTray.Notification(this._source, notifyTitle, msg);
            this._notification.setTransient(true);
        } else {
            this._notification = new MessageTray.Notification({source: this._source, title: notifyTitle, body: msg, isTransient: true});
        }
        if (action === 'show-settings') {
            this._notification.addAction(_('Settings'), () => {
                this.openPreferences();
            });
        } else if (action === 'show-details') {
            this._notification.addAction(_('Show details'), () => {
                this._openDependencies();
            });
        }
        this._notification.urgency = urgency;
        if (shellVersion45)
            this._source.showNotification(this._notification);
        else
            this._source.addNotification(this._notification);
        this._notification.connectObject('destroy', () => {
            this._notification = null;
        }, this._notification);
    }

    notifyUnsupportedDevice(pathSuffix) {
        this._pathSuffix = pathSuffix;
        if (this._pathSuffix === '')
            this._notify(_('Unsupported device.\nThis extension is not compatible with your device.'), 'show-details');
        else
            this._notify(_('Missing dependencies'), 'show-details');
    }

    notifyNoPolkitInstalled() {
        this._notify(_('Please install polkit from extension settings under Installation.'), 'show-settings');
    }

    notifyNeedPolkitUpdate() {
        this._notify(_('Please update polkit from extension settings under Installation.'), 'show-settings');
    }

    notifyCheckInstallationError() {
        this._notify(_('Install check failed.'), 'error');
    }

    notifyCheckInstallationTimeout() {
        this._notify(_('Install check timed out.'), 'error');
    }

    notifyAnErrorOccured(name) {
        this._notify(_('Encountered an unexpected error. (%s)').format(name), 'error');
    }

    notifyThresholdNotUpdated(name) {
        this._notify(_('Charging threshold not updated. (%s)').format(name), 'error');
    }

    notifyThresholdTimeout(name) {
        this._notify(_('Threshold update process timed out. (%s)').format(name), 'error');
    }

    notifyThresholdPasswordRequired() {
        this._notify(_('Apply correct Bios Password to set threshold.'), 'show-settings');
    }

    notifyUpdateThresholdBat1(endThresholdValue, startThresholdValue) {
        this._notify(_('Battery 1\nCharge thresholds are set to %d / %d %%')
                    .format(endThresholdValue, startThresholdValue));
    }

    notifyUpdateThreshold(endThresholdValue, startThresholdValue) {
        this._notify(_('Charge thresholds are set to %d / %d %%')
                    .format(endThresholdValue, startThresholdValue));
    }

    notifyUpdateLimitBat1(limitValue) {
        this._notify(_('Battery 1\nCharging Limit is set to %d%%').format(limitValue));
    }

    notifyUpdateLimit(limitValue) {
        this._notify(_('Charging Limit is set to %d%%').format(limitValue));
    }

    notifyUpdateThresholdBat2(endThresholdValue, startThresholdValue) {
        this._notify(_('Battery 2\nCharge thresholds are set to %d / %d %%')
                .format(endThresholdValue, startThresholdValue));
    }

    notifyUpdateLimitBat2(limitValue) {
        this._notify(_('Battery 2\nCharging Limit is set to %d%%')
                .format(limitValue));
    }

    notifyUpdateModeFul() {
        this._notify(_('Charging Mode is set to Full Capacity'));
    }

    notifyUpdateModeBal() {
        this._notify(_('Charging Mode is set to Balanced'));
    }

    notifyUpdateModeMax() {
        this._notify(_('Charging Mode is set to Maximum Lifespan'));
    }

    notifyUpdateModeExp() {
        this._notify(_('Charging Mode is set to Express'));
    }

    notifyUpdateModeAdv() {
        this._notify(_('Charging Mode is set to Adaptive'));
    }

    async openPreferences() {
        try {
            await Gio.DBus.session.call(
                'org.gnome.Shell.Extensions',
                '/org/gnome/Shell/Extensions',
                'org.gnome.Shell.Extensions',
                'OpenExtensionPrefs',
                new GLib.Variant('(ssa{sv})', [this._uuid, '', {}]),
                null,
                Gio.DBusCallFlags.NONE,
                -1,
                null);
        } catch {
        // do nothing
        }
    }

    _openDependencies() {
        const pathSuffix = this._pathSuffix === '/apple' ? '' : this._pathSuffix;
        const uri = `https://maniacx.github.io/Battery-Health-Charging/device-compatibility${pathSuffix}`;
        Gio.app_info_launch_default_for_uri_async(uri, null, null, null);
    }

    _updateNofitication() {
        if (this._device.mode !== 'adv' && this._device.mode !== 'exp' && !this._device.deviceUsesModeNotValue) {
            if (this._device.deviceHaveStartThreshold) {
                if (this._device.deviceHaveDualBattery)
                    this.notifyUpdateThresholdBat1(this._device.endLimitValue, this._device.startLimitValue);
                else
                    this.notifyUpdateThreshold(this._device.endLimitValue, this._device.startLimitValue);
            } else if (this._device.deviceHaveDualBattery) {
                this.notifyUpdateLimitBat1(this._device.endLimitValue);
            } else {
                this.notifyUpdateLimit(this._device.endLimitValue);
            }
        } else if (this._device.deviceUsesModeNotValue && this._device.mode === 'ful') {
            this.notifyUpdateModeFul();
        } else if (this._device.deviceUsesModeNotValue && this._device.mode === 'bal') {
            this.notifyUpdateModeBal();
        } else if (this._device.deviceUsesModeNotValue && this._device.mode === 'max') {
            this.notifyUpdateModeMax();
        } else if (this._device.deviceHaveAdaptiveMode && this._device.mode === 'adv') {
            this.notifyUpdateModeAdv();
        } else if (this._device.deviceHaveExpressMode && this._device.mode === 'exp') {
            this.notifyUpdateModeExp();
        }
    }

    _updateNofiticationBat2() {
        if (this._device.deviceHaveStartThreshold)
            this.notifyUpdateThresholdBat2(this._device.endLimit2Value, this._device.startLimit2Value);
        else
            this.notifyUpdateLimitBat2(this._device.endLimit2Value);
    }

    startDeviceNotification(device) {
        this._device = device;
        this._device.connectObject('threshold-applied', (o, updateSuccessful) => {
            if (updateSuccessful === 'success') {
                if (this.firstThresholdExecCompleted && this._showNotifications)
                    this._updateNofitication();
            } else if (updateSuccessful === 'success-bat2') {
                if (this.firstThresholdExecCompleted && this._showNotifications)
                    this._updateNofiticationBat2();
            } else if (updateSuccessful === 'password-required') {
                this.notifyThresholdPasswordRequired();
            } else if (updateSuccessful === 'error') {
                this.notifyAnErrorOccured(this._device.name);
            } else if (updateSuccessful === 'not-updated') {
                this.notifyThresholdNotUpdated(this._device.name);
            } else if (updateSuccessful === 'timeout') {
                this.notifyThresholdTimeout(this._device.name);
            }
        }, this);
    }

    _removeActiveNofications() {
        if (this._notification)
            this._notification.destroy(NotificationDestroyedReason.SOURCE_CLOSED);
    }

    destroy() {
        this._removeActiveNofications();
        this._settings = null;
    }
}
