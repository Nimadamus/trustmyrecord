#
# forms.py - Defines all web forms for your application
#

from flask_wtf import FlaskForm
# We need to import the fields for the new forms
from wtforms import StringField, IntegerField, SelectField, SubmitField, PasswordField
from wtforms.validators import DataRequired, NumberRange, Length, Email, EqualTo


# YOUR EXISTING FORM - We are keeping this!
class PickForm(FlaskForm):
    """
    Form for users to submit a sports pick.
    """
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


# --- THE MISSING FORMS - WE ARE ADDING THESE ---

class RegistrationForm(FlaskForm):
    """
    Form for new users to create an account.
    """
    username = StringField('Username',
                           validators=[DataRequired(), Length(min=2, max=20)])
    email = StringField('Email',
                        validators=[DataRequired(), Email()])
    password = PasswordField('Password', validators=[DataRequired()])
    confirm_password = PasswordField('Confirm Password',
                                     validators=[DataRequired(), EqualTo('password')])
    submit = SubmitField('Sign Up')


class LoginForm(FlaskForm):
    """
    Form for existing users to log in.
    """
    email = StringField('Email',
                        validators=[DataRequired(), Email()])
    password = PasswordField('Password', validators=[DataRequired()])
    submit = SubmitField('Login')
