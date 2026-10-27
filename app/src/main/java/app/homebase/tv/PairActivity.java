package app.homebase.tv;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.text.InputType;
import android.util.DisplayMetrics;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.inputmethod.EditorInfo;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;

/** First run (or hold OK on Settings): paste the Home Base code so the home screen can show what's up next. */
public class PairActivity extends Activity {
    private EditText box;
    private TextView status;
    private Button go;

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        DisplayMetrics dm = getResources().getDisplayMetrics();
        int W = dm.widthPixels, H = dm.heightPixels;
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setGravity(Gravity.CENTER_VERTICAL);
        col.setPadding(Math.round(W * 0.12f), Math.round(H * 0.08f), Math.round(W * 0.12f), Math.round(H * 0.08f));
        col.setBackground(new GradientDrawable(GradientDrawable.Orientation.TL_BR, new int[]{Color.rgb(24, 52, 44), Color.rgb(12, 18, 16)}));

        TextView title = text("Connect to Home Base", H * 0.06f, Color.WHITE, true);
        col.addView(title);
        TextView how = text("Paste your Home Base TV code below. The easy way: open the Google TV remote in the Google Home app on your phone, "
                + "tap the keyboard button, and paste the code Claude sent you. Then press Connect.", H * 0.03f, Color.rgb(200, 214, 207), false);
        how.setPadding(0, Math.round(H * 0.02f), 0, Math.round(H * 0.04f));
        col.addView(how);

        box = new EditText(this);
        box.setSingleLine(true);
        box.setHint("Home Base code");
        box.setText(Hb.code(this));
        box.setTextColor(Color.WHITE);
        box.setHintTextColor(Color.rgb(140, 160, 150));
        box.setTextSize(TypedValue.COMPLEX_UNIT_PX, H * 0.035f);
        box.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS | InputType.TYPE_TEXT_VARIATION_URI);
        box.setImeOptions(EditorInfo.IME_ACTION_DONE);
        box.setOnEditorActionListener((v, id, e) -> { connect(); return true; });
        col.addView(box, new LinearLayout.LayoutParams(-1, -2));

        go = new Button(this);
        go.setText("Connect");
        go.setTextSize(TypedValue.COMPLEX_UNIT_PX, H * 0.032f);
        go.setOnClickListener(v -> connect());
        LinearLayout.LayoutParams gp = new LinearLayout.LayoutParams(-2, -2);
        gp.topMargin = Math.round(H * 0.03f);
        col.addView(go, gp);

        status = text("", H * 0.028f, Color.rgb(240, 180, 60), false);
        status.setPadding(0, Math.round(H * 0.03f), 0, 0);
        col.addView(status);
        TextView credit = text("Home screen music: “Meditation Impromptu” 1–3 and “Healing” by Kevin MacLeod (incompetech.com), licensed under Creative Commons: By Attribution 4.0.", H * 0.022f, Color.rgb(150, 168, 160), false);
        credit.setPadding(0, Math.round(H * 0.05f), 0, 0);
        col.addView(credit);
        setContentView(col);
        box.requestFocus();
    }

    private TextView text(String s, float px, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextColor(color);
        t.setTextSize(TypedValue.COMPLEX_UNIT_PX, px);
        if (bold) t.setTypeface(Typeface.create("sans-serif-medium", Typeface.BOLD));
        return t;
    }

    private void connect() {
        final String code = Hb.parseCode(String.valueOf(box.getText()));
        status.setText("Checking…");
        go.setEnabled(false);
        new Thread(() -> {
            final String err = Hb.testCode(code);
            runOnUiThread(() -> {
                go.setEnabled(true);
                if (!err.isEmpty()) { status.setText(err); return; }
                Hb.prefs(this).edit().putString("code", code).apply();
                status.setText("Connected!");
                startActivity(new Intent(this, HomeActivity.class).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP));
                finish();
            });
        }).start();
    }

    @Override public void onBackPressed() {
        if (Hb.code(this).isEmpty()) return;   // nothing to go back to until it's connected
        super.onBackPressed();
    }
}
