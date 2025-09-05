// actions/20-relocate.ts
import { Entity } from '../../models';

const action = {
  key: 'relocate',
  label: 'Relocate',
  order: 20,
  appliesTo: () => true,

  view: (entity: Entity): string => {
    if (entity.type === "Box") {
      const href = `${encodeURIComponent(entity.id)}`;
      return `
       <div class="card">
        <h3>Box verschieben</h3>
        <form method="post" action="/api/box/${encodeURIComponent(entity.id)}/move">
          <label>Ort</label>
          <input name="toBoxId" placeholder="A-01-02" required />
          <input name="actor" id="relocateActor" readonly hidden />
          <div style="margin-top:8px"><button type="submit">Verschieben</button></div>
        </form>
        <script>
      (function(){
        var a = document.getElementById('relocateActor');
        try { var u = localStorage.getItem('username'); if (u && a) a.value = u; } catch(e){}
      })();
    </script>
      </div>
      `;
    }

    // Item relocate (keep inline form)
    return `
  <div class="card">
    <h3>Artikel verschieben</h3>
    <form method="post" action="/ui/api/item/${encodeURIComponent(entity.id)}/move"
          onsubmit="this.querySelector('button[type=submit]').disabled=true; localStorage.setItem('username', this.actor.value)">
      <label>Ziel BoxID</label>
      <input name="toBoxId" required placeholder="BOX-YYYY-NNNN" />
      <input name="actor" id="relocateActor" readonly hidden/>
      <div style="margin-top:8px"><button type="submit">Verschieben</button></div>
    </form>
    <script>
      (function(){
        var a = document.getElementById('relocateActor');
        try { var u = localStorage.getItem('username'); if (u && a) a.value = u; } catch(e){}
      })();
    </script>
  </div>
`;
  }
};

export default action;
