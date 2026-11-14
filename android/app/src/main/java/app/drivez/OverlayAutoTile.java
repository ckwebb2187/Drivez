package app.drivez;

import android.service.quicksettings.Tile;
import android.service.quicksettings.TileService;

// Quick-settings tile: should getting in the car open Waze with the Kaido overlay? Tap to flip.
public class OverlayAutoTile extends TileService {
    @Override
    public void onStartListening() { refresh(); }

    @Override
    public void onClick() {
        CarOverlay.setEnabled(this, !CarOverlay.enabled(this));
        refresh();
    }

    private void refresh() {
        Tile t = getQsTile();
        if (t == null) return;
        boolean on = CarOverlay.enabled(this);
        t.setState(on ? Tile.STATE_ACTIVE : Tile.STATE_INACTIVE);
        t.setLabel("Kaido auto");
        if (android.os.Build.VERSION.SDK_INT >= 29) t.setSubtitle(on ? "Opens in the car" : "Off");
        t.updateTile();
    }
}
