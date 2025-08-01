from flask_wtf import FlaskForm
from wtforms import StringField, IntegerField, SelectField, SubmitField
from wtforms.validators import DataRequired, NumberRange

class PickForm(FlaskForm):
    # We will expand this with dynamic choices later. For now, it's a text field.
    sport = StringField('Sport', validators=[DataRequired()], render_kw={"placeholder": "e.g., NFL, NBA, MLB"})
    event_details = StringField('Event Details', validators=[DataRequired()], render_kw={"placeholder": "e.g., Green Bay Packers vs. Chicago Bears"})
    pick_selection = StringField('Your Pick', validators=[DataRequired()], render_kw={"placeholder": "e.g., Green Bay Packers -7.5"})
    
    stake_units = IntegerField('Stake (Units)', 
                             validators=[DataRequired(), NumberRange(min=1, max=10, message="Units must be between 1 and 10.")], 
                             default=1)
    
    odds = IntegerField('American Odds', 
                      validators=[DataRequired()], 
                      default=-110,
                      render_kw={"placeholder": "e.g., -110, +220"})

    submit = SubmitField('Submit Pick to Ledger')
