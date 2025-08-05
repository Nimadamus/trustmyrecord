#
# forms.py - Defines all web forms for your application
#

from flask_wtf import FlaskForm
# We need to import the fields for the new forms
from wtforms import StringField, IntegerField, SelectField, SubmitField, PasswordField, BooleanField, TextAreaField, RadioField
from wtforms.validators import DataRequired, NumberRange, Length, Email, EqualTo

class GradePickForm(FlaskForm):
    result = RadioField('Result', choices=[
        ('win', 'Win'),
        ('loss', 'Loss'),
        ('push', 'Push')
    ], validators=[DataRequired()])
    submit = SubmitField('Grade Pick')



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
    remember = BooleanField('Remember Me')
    submit = SubmitField('Login')


class ProfileEditForm(FlaskForm):
    username = StringField('Username', validators=[DataRequired(), Length(min=2, max=20)])
    favorite_team = StringField('Favorite Team', validators=[Length(max=50)])
    avatar_url = StringField('Avatar URL', validators=[Length(max=200)])
    email_private = BooleanField('Keep email private')
    submit = SubmitField('Update Profile')


class MessageForm(FlaskForm):
    body = TextAreaField('Message', validators=[DataRequired(), Length(min=1, max=140)])
    submit = SubmitField('Send')


class ForumPostForm(FlaskForm):
    title = StringField('Title', validators=[DataRequired(), Length(min=1, max=100)])
    body = TextAreaField('Post Content', validators=[DataRequired(), Length(min=1, max=500)])
    submit = SubmitField('Post to Forum')

class ReplyForm(FlaskForm):
    body = TextAreaField('Reply', validators=[DataRequired(), Length(min=1, max=500)])
    submit = SubmitField('Submit Reply')