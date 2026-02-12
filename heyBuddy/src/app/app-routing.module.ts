import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { CallComponent } from './pages/call/call/call.component';

const routes: Routes = [
  {path: 'call/:role', component: CallComponent},
  {path: '**', redirectTo: 'call/A'}
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
