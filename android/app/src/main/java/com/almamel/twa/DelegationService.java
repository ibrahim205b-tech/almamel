package com.almamel.twa;

import com.google.androidbrowserhelper.locationdelegation.LocationDelegationExtraCommandHandler;

/** خدمة التفويض: الإشعارات (من المكتبة) + تحديد الموقع لزر «استخدم موقعي الحالي». */
public class DelegationService extends com.google.androidbrowserhelper.trusted.DelegationService {
    @Override
    public void onCreate() {
        super.onCreate();
        registerExtraCommandHandler(new LocationDelegationExtraCommandHandler());
    }
}
